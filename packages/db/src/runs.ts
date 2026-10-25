import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  assertSufficientBudget,
  releaseEstimateForRun,
  reserveEstimateForTask,
} from "./budgets.js";
import { agentRuns, tasks, type AgentRun } from "./schema.js";

export class RunError extends Error {
  readonly code: "not_found" | "conflict" | "not_owner" | "policy";

  constructor(code: RunError["code"], message: string) {
    super(message);
    this.name = "RunError";
    this.code = code;
  }
}

export const DEFAULT_LEASE_MS = 30_000;

/** Max times a RUNNING run may be reaped back to QUEUED before poison-fail. */
export const MAX_LEASE_RECLAIMS = 3;

/** Wall-clock backstop for RUNNING reclaim loops. */
export const MAX_RUN_WALL_MS = 45 * 60_000;

/**
 * WAITING_CI without accept-ready CI fails closed after this age
 * (uses finished_at set when entering WAITING_CI). Override: WAITING_CI_TIMEOUT_MS.
 */
export const DEFAULT_WAITING_CI_TIMEOUT_MS = 6 * 60 * 60_000;

/**
 * VALIDATING with a null lease fails closed after this age (shorter than
 * MAX_RUN_WALL_MS). Override: VALIDATING_STUCK_MS.
 */
export const DEFAULT_VALIDATING_STUCK_MS = 15 * 60_000;

const RECLAIM_PREFIX = "reclaim:";

/** Parse reclaim counter stored in error_message as `reclaim:N`. */
export function parseReclaimCount(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): number {
  if (errorCode !== "lease_reclaimed" || !errorMessage?.startsWith(RECLAIM_PREFIX)) {
    return 0;
  }
  const n = Number(errorMessage.slice(RECLAIM_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function resolveWaitingCiTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.WAITING_CI_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_WAITING_CI_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return DEFAULT_WAITING_CI_TIMEOUT_MS;
  return Math.floor(n);
}

export function resolveValidatingStuckMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VALIDATING_STUCK_MS?.trim();
  if (!raw) return DEFAULT_VALIDATING_STUCK_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return DEFAULT_VALIDATING_STUCK_MS;
  return Math.floor(n);
}

function mapRow(row: Record<string, unknown>): AgentRun {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    taskId: String(row.task_id),
    status: String(row.status),
    attempt: Number(row.attempt),
    agentProfileKey: String(row.agent_profile_key),
    baseSha: String(row.base_sha),
    headSha: row.head_sha == null ? null : String(row.head_sha),
    branchName: row.branch_name == null ? null : String(row.branch_name),
    prNumber: row.pr_number == null ? null : Number(row.pr_number),
    prUrl: row.pr_url == null ? null : String(row.pr_url),
    toolAllowlist: String(row.tool_allowlist ?? "[]"),
    spendCapMicros: Number(row.spend_cap_micros ?? 0),
    estimatedCostMicros: Number(row.estimated_cost_micros ?? 0),
    actualCostMicros: Number(row.actual_cost_micros ?? 0),
    sandboxId: row.sandbox_id == null ? null : String(row.sandbox_id),
    idempotencyKey: String(row.idempotency_key),
    errorCode: row.error_code == null ? null : String(row.error_code),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    leaseOwner: row.lease_owner == null ? null : String(row.lease_owner),
    leaseUntil: row.lease_until == null ? null : new Date(String(row.lease_until)),
    cancelRequestedAt:
      row.cancel_requested_at == null
        ? null
        : new Date(String(row.cancel_requested_at)),
    startedAt: row.started_at == null ? null : new Date(String(row.started_at)),
    finishedAt:
      row.finished_at == null ? null : new Date(String(row.finished_at)),
    tournamentId:
      row.tournament_id == null ? null : String(row.tournament_id),
    contenderId: row.contender_id == null ? null : String(row.contender_id),
    fitnessScore:
      row.fitness_score == null ? null : Number(row.fitness_score),
    efficiencyScore:
      row.efficiency_score == null ? null : Number(row.efficiency_score),
    fitnessEvidenceRef:
      row.fitness_evidence_ref == null
        ? null
        : String(row.fitness_evidence_ref),
    previewUrl: row.preview_url == null ? null : String(row.preview_url),
    tournamentResult:
      row.tournament_result == null ? null : String(row.tournament_result),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

/**
 * Enqueue a run for a task. Duplicate idempotency keys return the existing row.
 */
export async function enqueueAgentRun(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    idempotencyKey: string;
    baseSha?: string;
    spendCapMicros?: number;
    estimatedCostMicros?: number;
    agentProfileKey?: string;
    attempt?: number;
    tournamentId?: string | null;
    contenderId?: string | null;
    branchName?: string | null;
  },
): Promise<{ run: AgentRun; created: boolean }> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.projectId, input.projectId),
      ),
    )
    .limit(1);

  if (!task) {
    throw new RunError("not_found", "Task not found");
  }

  const [existing] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.taskId, input.taskId),
        eq(agentRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  if (existing) {
    return { run: existing, created: false };
  }

  const now = new Date();
  const [run] = await db
    .insert(agentRuns)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      status: "QUEUED",
      attempt: input.attempt ?? task.attemptCount + 1,
      agentProfileKey: input.agentProfileKey ?? "engineer",
      baseSha: input.baseSha ?? task.baseSha ?? "unknown",
      branchName: input.branchName ?? null,
      // Tool names (edit/read/…), not path globs — allowedPaths is enforced separately.
      toolAllowlist: "[]",
      spendCapMicros: input.spendCapMicros ?? task.estimateMicros ?? 0,
      estimatedCostMicros:
        input.estimatedCostMicros ?? task.estimateMicros ?? 0,
      actualCostMicros: 0,
      idempotencyKey: input.idempotencyKey,
      tournamentId: input.tournamentId ?? null,
      contenderId: input.contenderId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!run) throw new Error("Failed to enqueue run");
  return { run, created: true };
}

/**
 * Public enqueue path: task must already be QUEUED (approved).
 * Idempotency key suppresses duplicates; budget reserved only on create.
 */
export async function createTaskRun(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    idempotencyKey: string;
    actor: string;
    baseSha?: string;
  },
): Promise<{ run: AgentRun; created: boolean }> {
  const key = input.idempotencyKey.trim();
  if (!key) {
    throw new RunError("policy", "idempotencyKey is required");
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!task) {
    throw new RunError("not_found", "Task not found");
  }

  if (task.status !== "QUEUED" && task.status !== "RUNNING") {
    throw new RunError(
      "policy",
      "Task must be QUEUED (approved) before creating a run",
    );
  }

  const [existing] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.taskId, task.id),
        eq(agentRuns.idempotencyKey, key),
      ),
    )
    .limit(1);
  if (existing) {
    return { run: existing, created: false };
  }

  const estimateMicros = task.estimateMicros ?? 0;
  await assertSufficientBudget(
    db,
    input.workspaceId,
    task.projectId,
    estimateMicros,
  );

  const result = await enqueueAgentRun(db, {
    workspaceId: input.workspaceId,
    projectId: task.projectId,
    taskId: task.id,
    idempotencyKey: key,
    baseSha: input.baseSha,
    estimatedCostMicros: estimateMicros,
    spendCapMicros: estimateMicros,
  });

  if (result.created) {
    await reserveEstimateForTask(db, {
      workspaceId: input.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      estimateMicros,
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "run.enqueue",
      targetType: "run",
      targetId: result.run.id,
      meta: { taskId: task.id, idempotencyKey: key },
    });
  }

  return result;
}

/** Workspace-scoped run lookup (IDOR fail-closed). */
export async function getAgentRunForWorkspace(
  db: Database,
  workspaceId: string,
  runId: string,
): Promise<AgentRun | undefined> {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)),
    )
    .limit(1);
  return row;
}

/**
 * Cooperative cancel: set cancel_requested_at.
 * QUEUED runs become CANCELLED immediately so workers never claim them.
 */
export async function requestCancelRun(
  db: Database,
  input: { workspaceId: string; runId: string; actor: string },
): Promise<AgentRun> {
  const run = await getAgentRunForWorkspace(
    db,
    input.workspaceId,
    input.runId,
  );
  if (!run) {
    throw new RunError("not_found", "Run not found");
  }

  if (run.cancelRequestedAt) {
    return run;
  }

  const terminal = new Set([
    "CANCELLED",
    "FAILED",
    "REVIEW_REQUIRED",
    "DONE",
  ]);
  if (terminal.has(run.status)) {
    throw new RunError(
      "conflict",
      `Cannot cancel run in status ${run.status}`,
    );
  }

  const now = new Date();
  // QUEUED / WAITING_CI: no active worker lease — hard cancel immediately.
  if (run.status === "QUEUED" || run.status === "WAITING_CI") {
    const [updated] = await db
      .update(agentRuns)
      .set({
        status: "CANCELLED",
        cancelRequestedAt: now,
        finishedAt: now,
        leaseOwner: null,
        leaseUntil: null,
        errorCode: "cancelled",
        errorMessage:
          run.status === "WAITING_CI"
            ? "Cancelled while awaiting CI"
            : "Cancelled before start",
        updatedAt: now,
      })
      .where(
        and(
          eq(agentRuns.id, run.id),
          eq(agentRuns.workspaceId, input.workspaceId),
          sql`${agentRuns.status} in ('QUEUED', 'WAITING_CI')`,
        ),
      )
      .returning();
    if (!updated) {
      throw new RunError("conflict", "Run status changed; retry cancel");
    }
    await releaseEstimateForRun(db, {
      workspaceId: updated.workspaceId,
      projectId: updated.projectId,
      taskId: updated.taskId,
      runId: updated.id,
      amountMicros: updated.estimatedCostMicros ?? 0,
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "run.cancel",
      targetType: "run",
      targetId: updated.id,
      meta: { status: updated.status },
    });
    return updated;
  }

  const [updated] = await db
    .update(agentRuns)
    .set({
      cancelRequestedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentRuns.id, run.id),
        eq(agentRuns.workspaceId, input.workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    throw new RunError("not_found", "Run not found");
  }
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "run.cancel",
    targetType: "run",
    targetId: updated.id,
    meta: { status: updated.status },
  });
  return updated;
}

/**
 * Claim next claimable run with FOR UPDATE SKIP LOCKED.
 * Claimable: QUEUED, or RUNNING with expired lease (stale reclaim).
 */
export async function claimNextRun(
  db: Database,
  workerId: string,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<AgentRun | null> {
  return claimWithFilter(db, workerId, leaseMs, null);
}

/**
 * Claim a specific run (SKIP LOCKED). Used by concurrency tests and targeted reclaim.
 */
export async function claimRunById(
  db: Database,
  runId: string,
  workerId: string,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<AgentRun | null> {
  return claimWithFilter(db, workerId, leaseMs, runId);
}

async function claimWithFilter(
  db: Database,
  workerId: string,
  leaseMs: number,
  runId: string | null,
): Promise<AgentRun | null> {
  const leaseUntilIso = new Date(Date.now() + leaseMs).toISOString();
  const rows = runId
    ? await db.$client<Record<string, unknown>[]>`
        UPDATE agent_runs AS r
        SET
          status = 'RUNNING',
          lease_owner = ${workerId},
          lease_until = ${leaseUntilIso}::timestamptz,
          started_at = coalesce(r.started_at, now()),
          updated_at = now()
        WHERE r.id = (
          SELECT id
          FROM agent_runs
          WHERE id = ${runId}::uuid
            AND cancel_requested_at IS NULL
            AND (
              status = 'QUEUED'
              OR (
                status = 'RUNNING'
                AND lease_until IS NOT NULL
                AND lease_until < now()
              )
            )
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING *
      `
    : await db.$client<Record<string, unknown>[]>`
        UPDATE agent_runs AS r
        SET
          status = 'RUNNING',
          lease_owner = ${workerId},
          lease_until = ${leaseUntilIso}::timestamptz,
          started_at = coalesce(r.started_at, now()),
          updated_at = now()
        WHERE r.id = (
          SELECT ar.id
          FROM agent_runs AS ar
          LEFT JOIN arenas AS a ON a.project_id = ar.project_id
          WHERE ar.cancel_requested_at IS NULL
            AND (
              ar.status = 'QUEUED'
              OR (
                ar.status = 'RUNNING'
                AND ar.lease_until IS NOT NULL
                AND ar.lease_until < now()
              )
            )
            AND (a.id IS NULL OR a.status NOT IN ('KILLED', 'PAUSED'))
          ORDER BY ar.created_at ASC
          FOR UPDATE OF ar SKIP LOCKED
          LIMIT 1
        )
        RETURNING *
      `;

  const row = rows[0];
  return row ? mapRow(row) : null;
}

/** Extend lease if this worker still owns the run. */
export async function renewRunLease(
  db: Database,
  runId: string,
  workerId: string,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<AgentRun> {
  const leaseUntil = new Date(Date.now() + leaseMs);
  const [updated] = await db
    .update(agentRuns)
    .set({ leaseUntil, updatedAt: new Date() })
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.leaseOwner, workerId),
        sql`${agentRuns.status} in ('RUNNING', 'VALIDATING')`,
      ),
    )
    .returning();

  if (!updated) {
    throw new RunError(
      "not_owner",
      "Cannot renew lease — not owner or not RUNNING/VALIDATING",
    );
  }
  return updated;
}

export type ReapedFailedRun = {
  id: string;
  taskId: string;
  workspaceId: string;
  projectId: string;
  estimatedCostMicros: number;
  errorCode: string;
};

export type ReapStaleRunsResult = {
  /** Expired RUNNING leases returned to QUEUED. */
  requeued: number;
  /** Expired RUNNING leases poison-failed (max reclaims / wall-clock). */
  failedPoison: number;
  /** Expired VALIDATING leases failed closed (not re-queued mid-validation). */
  failedValidating: number;
  /** WAITING_CI past wall-clock without CI accept-ready. */
  failedWaitingCi: number;
  /** VALIDATING recovered via delivery_checkpoint (PR already shipped). */
  recoveredDelivered: number;
  /** Runs recovered from checkpoint — caller should align task status. */
  recoveredDeliveredRuns: ReapedFailedRun[];
  /** Runs failed by reaper — caller should fail matching tasks when still in-flight. */
  failedRuns: ReapedFailedRun[];
  /** @deprecated use failedRuns filtered by validating_lease_expired */
  failedValidatingRuns: ReapedFailedRun[];
};

type FailedRow = {
  id: string;
  task_id: string;
  workspace_id: string;
  project_id: string;
  estimated_cost_micros: number | null;
  error_code: string | null;
};

function mapFailedRows(rows: FailedRow[]): ReapedFailedRun[] {
  return rows.map((row) => ({
    id: String(row.id),
    taskId: String(row.task_id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    estimatedCostMicros: Number(row.estimated_cost_micros ?? 0),
    errorCode: String(row.error_code ?? "unknown"),
  }));
}

async function releaseFailedEstimates(
  db: Database,
  runs: ReapedFailedRun[],
): Promise<void> {
  for (const run of runs) {
    if (run.estimatedCostMicros <= 0) continue;
    await releaseEstimateForRun(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: run.taskId,
      runId: run.id,
      amountMicros: run.estimatedCostMicros,
    }).catch(() => undefined);
  }
}

/**
 * Reaper:
 * - expired RUNNING + reclaim budget / wall-clock OK → QUEUED (increment reclaim count)
 * - expired RUNNING + poison (max reclaims or wall-clock) → FAILED
 * - expired VALIDATING → FAILED (fail closed; not safe to re-queue mid-validation)
 * - null-lease VALIDATING older than VALIDATING_STUCK_MS → FAILED (faster than wall)
 * - WAITING_CI older than timeout (finished_at) → FAILED (CI never accept-ready)
 */
export async function reapStaleRuns(db: Database): Promise<ReapStaleRunsResult> {
  const wallCutoff = new Date(Date.now() - MAX_RUN_WALL_MS).toISOString();
  const validatingStuckCutoff = new Date(
    Date.now() - resolveValidatingStuckMs(),
  ).toISOString();
  const waitingCiCutoff = new Date(
    Date.now() - resolveWaitingCiTimeoutMs(),
  ).toISOString();

  const poisonRows = await db.$client<FailedRow[]>`
    UPDATE agent_runs
    SET
      status = 'FAILED',
      error_code = 'lease_expired_poison',
      error_message = 'RUNNING lease expired after max reclaims or wall-clock budget',
      lease_owner = NULL,
      lease_until = NULL,
      finished_at = now(),
      updated_at = now()
    WHERE status = 'RUNNING'
      AND lease_until IS NOT NULL
      AND lease_until < now()
      AND cancel_requested_at IS NULL
      AND (
        (
          error_code = 'lease_reclaimed'
          AND error_message ~ '^reclaim:[0-9]+$'
          AND substring(error_message from 9)::int >= ${MAX_LEASE_RECLAIMS}
        )
        OR (
          started_at IS NOT NULL
          AND started_at < ${wallCutoff}::timestamptz
        )
      )
    RETURNING id, task_id, workspace_id, project_id, estimated_cost_micros, error_code
  `;

  const requeuedRows = await db.$client<
    { id: string; error_code: string | null; error_message: string | null }[]
  >`
    UPDATE agent_runs
    SET
      status = 'QUEUED',
      lease_owner = NULL,
      lease_until = NULL,
      error_code = 'lease_reclaimed',
      error_message = CASE
        WHEN error_code = 'lease_reclaimed'
          AND error_message ~ '^reclaim:[0-9]+$'
        THEN 'reclaim:' || (substring(error_message from 9)::int + 1)::text
        ELSE 'reclaim:1'
      END,
      updated_at = now()
    WHERE status = 'RUNNING'
      AND lease_until IS NOT NULL
      AND lease_until < now()
      AND cancel_requested_at IS NULL
    RETURNING id, error_code, error_message
  `;

  // VALIDATING with a delivery checkpoint: promote instead of fail (PR already open).
  const expiredValidating = await db.$client<FailedRow[]>`
    SELECT id, task_id, workspace_id, project_id, estimated_cost_micros, error_code
    FROM agent_runs
    WHERE status = 'VALIDATING'
      AND cancel_requested_at IS NULL
      AND (
        (lease_until IS NOT NULL AND lease_until < now())
        OR (
          lease_until IS NULL
          AND updated_at < ${validatingStuckCutoff}::timestamptz
        )
      )
  `;

  const recoveredDeliveredRuns: ReapedFailedRun[] = [];
  if (expiredValidating.length > 0) {
    const { getDeliveryCheckpoint } = await import("./delivery-artifacts.js");
    const { recoverDeliveredRun } = await import("./run-events.js");
    for (const row of expiredValidating) {
      const runId = String(row.id);
      const workspaceId = String(row.workspace_id);
      const checkpoint = await getDeliveryCheckpoint(db, workspaceId, runId);
      if (!checkpoint) continue;
      const recovered = await recoverDeliveredRun(db, {
        runId,
        branchName: checkpoint.branchName,
        headSha: checkpoint.headSha,
        prNumber: checkpoint.prNumber,
        prUrl: checkpoint.prUrl,
        actualCostMicros: checkpoint.actualCostMicros,
        awaitLiveCi: checkpoint.awaitLiveCi,
        previewUrl: checkpoint.previewUrl,
      });
      if (recovered) {
        recoveredDeliveredRuns.push({
          id: runId,
          taskId: String(row.task_id),
          workspaceId,
          projectId: String(row.project_id),
          estimatedCostMicros: Number(row.estimated_cost_micros ?? 0),
          errorCode: checkpoint.awaitLiveCi
            ? "recovered_waiting_ci"
            : "recovered_review_required",
        });
      }
    }
  }

  const failedValidatingRows = await db.$client<FailedRow[]>`
    UPDATE agent_runs
    SET
      status = 'FAILED',
      error_code = 'validating_lease_expired',
      error_message = CASE
        WHEN lease_until IS NOT NULL AND lease_until < now()
          THEN 'VALIDATING lease expired — worker lost ownership before delivery completed'
        ELSE 'VALIDATING stuck without a live lease — fail closed'
      END,
      lease_owner = NULL,
      lease_until = NULL,
      finished_at = now(),
      updated_at = now()
    WHERE status = 'VALIDATING'
      AND cancel_requested_at IS NULL
      AND (
        (lease_until IS NOT NULL AND lease_until < now())
        OR (
          lease_until IS NULL
          AND updated_at < ${validatingStuckCutoff}::timestamptz
        )
      )
    RETURNING id, task_id, workspace_id, project_id, estimated_cost_micros, error_code
  `;

  const failedWaitingCiRows = await db.$client<FailedRow[]>`
    UPDATE agent_runs
    SET
      status = 'FAILED',
      error_code = 'waiting_ci_timeout',
      error_message = 'WAITING_CI exceeded wall-clock without CI accept-ready',
      lease_owner = NULL,
      lease_until = NULL,
      finished_at = now(),
      updated_at = now()
    WHERE status = 'WAITING_CI'
      AND cancel_requested_at IS NULL
      AND finished_at IS NOT NULL
      AND finished_at < ${waitingCiCutoff}::timestamptz
    RETURNING id, task_id, workspace_id, project_id, estimated_cost_micros, error_code
  `;

  const failedPoison = mapFailedRows(poisonRows);
  const failedValidatingRuns = mapFailedRows(failedValidatingRows);
  const failedWaitingCi = mapFailedRows(failedWaitingCiRows);
  const failedRuns = [
    ...failedPoison,
    ...failedValidatingRuns,
    ...failedWaitingCi,
  ];
  await releaseFailedEstimates(db, failedRuns);

  return {
    requeued: requeuedRows.length,
    failedPoison: failedPoison.length,
    failedValidating: failedValidatingRuns.length,
    failedWaitingCi: failedWaitingCi.length,
    recoveredDelivered: recoveredDeliveredRuns.length,
    recoveredDeliveredRuns,
    failedRuns,
    failedValidatingRuns,
  };
}

/**
 * Release a claimed run back to QUEUED (worker stub / cooperative yield).
 */
export async function releaseRunClaim(
  db: Database,
  runId: string,
  workerId: string,
): Promise<AgentRun> {
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "QUEUED",
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.leaseOwner, workerId),
        eq(agentRuns.status, "RUNNING"),
      ),
    )
    .returning();

  if (!updated) {
    throw new RunError("not_owner", "Cannot release — not owner or not RUNNING");
  }
  return updated;
}

export async function getAgentRun(
  db: Database,
  runId: string,
): Promise<AgentRun | undefined> {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  return row;
}

/** Attach sandbox id to a claimed run (worker ↔ LocalSandboxManager). */
export async function attachSandboxToRun(
  db: Database,
  input: { runId: string; workerId: string; sandboxId: string },
): Promise<AgentRun> {
  const [updated] = await db
    .update(agentRuns)
    .set({
      sandboxId: input.sandboxId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        eq(agentRuns.leaseOwner, input.workerId),
        sql`${agentRuns.status} in ('RUNNING', 'VALIDATING')`,
      ),
    )
    .returning();
  if (!updated) {
    throw new RunError(
      "not_owner",
      "Cannot attach sandbox — not owner or not RUNNING/VALIDATING",
    );
  }
  return updated;
}

export async function getTaskById(
  db: Database,
  taskId: string,
): Promise<import("./schema.js").Task | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row;
}

export async function getTaskForWorkspace(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<import("./schema.js").Task | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
    .limit(1);
  return row;
}

/** Runs for a task, newest first. */
export async function listRunsForTask(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<AgentRun[]> {
  return db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.taskId, taskId),
        eq(agentRuns.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(agentRuns.createdAt));
}

export async function setTaskPrUrl(
  db: Database,
  taskId: string,
  prUrl: string,
): Promise<void> {
  await db
    .update(tasks)
    .set({ prUrl, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

/** True when a RUNNING run's lease has expired (stale — reaper will reclaim). */
export function isRunLeaseStale(
  run: Pick<AgentRun, "status" | "leaseUntil">,
  now: Date = new Date(),
): boolean {
  return (
    run.status === "RUNNING" &&
    run.leaseUntil != null &&
    run.leaseUntil.getTime() < now.getTime()
  );
}

/** Count claimable jobs (QUEUED + stale RUNNING). */
export async function countClaimableRuns(db: Database): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(agentRuns)
    .where(
      sql`${agentRuns.status} = 'QUEUED' OR (${agentRuns.status} = 'RUNNING' AND ${agentRuns.leaseUntil} IS NOT NULL AND ${agentRuns.leaseUntil} < now())`,
    );
  return Number(row?.n ?? 0);
}

/** Inflight runs for plan concurrency enforcement (queued + active work). */
export async function countInflightRunsForWorkspace(
  db: Database,
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        sql`${agentRuns.status} in ('QUEUED', 'RUNNING', 'VALIDATING', 'WAITING_CI')`,
      ),
    );
  return Number(row?.n ?? 0);
}
