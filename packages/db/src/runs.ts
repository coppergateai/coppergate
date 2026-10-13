import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import { assertSufficientBudget, reserveEstimateForTask } from "./budgets.js";
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
      toolAllowlist: task.allowedPaths,
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
  if (run.status === "QUEUED") {
    const [updated] = await db
      .update(agentRuns)
      .set({
        status: "CANCELLED",
        cancelRequestedAt: now,
        finishedAt: now,
        leaseOwner: null,
        leaseUntil: null,
        errorCode: "cancelled",
        errorMessage: "Cancelled before start",
        updatedAt: now,
      })
      .where(
        and(
          eq(agentRuns.id, run.id),
          eq(agentRuns.workspaceId, input.workspaceId),
          eq(agentRuns.status, "QUEUED"),
        ),
      )
      .returning();
    if (!updated) {
      throw new RunError("conflict", "Run status changed; retry cancel");
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
          SELECT id
          FROM agent_runs
          WHERE cancel_requested_at IS NULL
            AND (
              status = 'QUEUED'
              OR (
                status = 'RUNNING'
                AND lease_until IS NOT NULL
                AND lease_until < now()
              )
            )
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
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

/**
 * Reaper: expired RUNNING leases → QUEUED (clears owner).
 * Returns number of rows reaped.
 */
export async function reapStaleRuns(db: Database): Promise<number> {
  const result = await db.$client<{ id: string }[]>`
    UPDATE agent_runs
    SET
      status = 'QUEUED',
      lease_owner = NULL,
      lease_until = NULL,
      updated_at = now()
    WHERE status = 'RUNNING'
      AND lease_until IS NOT NULL
      AND lease_until < now()
      AND cancel_requested_at IS NULL
    RETURNING id
  `;
  return result.length;
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
