import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { releaseEstimateForRun } from "./budgets.js";
import { redactPayload, redactString } from "./redact.js";
import {
  agentRunEvents,
  agentRuns,
  type AgentRun,
  type AgentRunEvent,
} from "./schema.js";
import { RunError } from "./runs.js";

async function releaseRunEstimate(db: Database, run: AgentRun): Promise<void> {
  const amount = run.estimatedCostMicros ?? 0;
  if (amount <= 0) return;
  await releaseEstimateForRun(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: run.taskId,
    runId: run.id,
    amountMicros: amount,
  });
}

export async function appendRunEvent(
  db: Database,
  input: {
    runId: string;
    workspaceId: string;
    kind: string;
    payload?: Record<string, unknown>;
  },
): Promise<AgentRunEvent> {
  const seqRows = await db
    .select({
      maxSeq: sql<number>`coalesce(max(${agentRunEvents.seq}), 0)`,
    })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, input.runId));
  const nextSeq = Number(seqRows[0]?.maxSeq ?? 0) + 1;

  const safePayload = redactPayload(input.payload);
  const [row] = await db
    .insert(agentRunEvents)
    .values({
      id: crypto.randomUUID(),
      runId: input.runId,
      workspaceId: input.workspaceId,
      seq: nextSeq,
      kind: redactString(input.kind).slice(0, 64),
      payload: JSON.stringify(safePayload),
      createdAt: new Date(),
    })
    .returning();

  if (!row) throw new Error("Failed to append run event");
  return row;
}

export async function listRunEvents(
  db: Database,
  runId: string,
  options?: { afterSeq?: number },
): Promise<AgentRunEvent[]> {
  const afterSeq = options?.afterSeq;
  if (afterSeq != null && Number.isFinite(afterSeq)) {
    return db
      .select()
      .from(agentRunEvents)
      .where(
        and(
          eq(agentRunEvents.runId, runId),
          sql`${agentRunEvents.seq} > ${afterSeq}`,
        ),
      )
      .orderBy(asc(agentRunEvents.seq));
  }

  return db
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId))
    .orderBy(asc(agentRunEvents.seq));
}

export async function listRunEventsForWorkspace(
  db: Database,
  workspaceId: string,
  runId: string,
  options?: { afterSeq?: number },
): Promise<AgentRunEvent[]> {
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!run) {
    throw new RunError("not_found", "Run not found");
  }
  return listRunEvents(db, runId, options);
}

export async function isRunCancelRequested(
  db: Database,
  runId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ cancelRequestedAt: agentRuns.cancelRequestedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  return !!row?.cancelRequestedAt;
}

export async function markRunValidating(
  db: Database,
  input: { runId: string; workerId: string },
): Promise<AgentRun> {
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "VALIDATING",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        eq(agentRuns.leaseOwner, input.workerId),
        eq(agentRuns.status, "RUNNING"),
      ),
    )
    .returning();

  if (!updated) {
    throw new RunError(
      "not_owner",
      "Cannot enter VALIDATING — not owner or not RUNNING",
    );
  }
  return updated;
}

/** Live http: PR opened, awaiting CI. Keeps estimate reserve; clears lease. */
export async function markRunWaitingCi(
  db: Database,
  input: {
    runId: string;
    workerId: string;
    branchName: string;
    headSha: string;
    prNumber: number;
    prUrl: string;
    actualCostMicros: number;
    previewUrl?: string | null;
  },
): Promise<AgentRun> {
  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "WAITING_CI",
      branchName: input.branchName,
      headSha: input.headSha,
      prNumber: input.prNumber,
      prUrl: input.prUrl,
      actualCostMicros: input.actualCostMicros,
      previewUrl: input.previewUrl ?? null,
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
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
      "Cannot enter WAITING_CI — not owner or not RUNNING/VALIDATING",
    );
  }
  // Durable accept gate — must land with status, not as a later best-effort event.
  await appendRunEvent(db, {
    runId: updated.id,
    workspaceId: updated.workspaceId,
    kind: "evidence",
    payload: {
      message: "Awaiting live CI evidence",
      fitness: "pending",
      headSha: input.headSha,
      prNumber: input.prNumber,
      prUrl: input.prUrl,
    },
  }).catch(() => undefined);
  return updated;
}

/**
 * Recover VALIDATING → WAITING_CI / REVIEW_REQUIRED after a durable delivery
 * checkpoint when the worker lost its lease mid-finalize (no owner required).
 */
export async function recoverDeliveredRun(
  db: Database,
  input: {
    runId: string;
    branchName: string;
    headSha: string;
    prNumber: number;
    prUrl: string;
    actualCostMicros: number;
    awaitLiveCi: boolean;
    previewUrl?: string | null;
  },
): Promise<AgentRun | null> {
  const now = new Date();
  const status = input.awaitLiveCi ? "WAITING_CI" : "REVIEW_REQUIRED";
  const [updated] = await db
    .update(agentRuns)
    .set({
      status,
      branchName: input.branchName,
      headSha: input.headSha,
      prNumber: input.prNumber,
      prUrl: input.prUrl,
      actualCostMicros: input.actualCostMicros,
      previewUrl: input.previewUrl ?? null,
      errorCode: null,
      errorMessage: null,
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(agentRuns.id, input.runId), eq(agentRuns.status, "VALIDATING")),
    )
    .returning();

  if (!updated) return null;
  if (!input.awaitLiveCi) {
    await releaseRunEstimate(db, updated);
  } else {
    await appendRunEvent(db, {
      runId: updated.id,
      workspaceId: updated.workspaceId,
      kind: "evidence",
      payload: {
        message: "Awaiting live CI evidence (delivery checkpoint recovery)",
        fitness: "pending",
        headSha: input.headSha,
        prNumber: input.prNumber,
        prUrl: input.prUrl,
        recovered: true,
      },
    }).catch(() => undefined);
  }
  return updated;
}

/** Promote WAITING_CI → REVIEW_REQUIRED after CI acceptReady (no lease owner). */
export async function promoteRunFromWaitingCi(
  db: Database,
  runId: string,
): Promise<AgentRun> {
  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "REVIEW_REQUIRED",
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "WAITING_CI")))
    .returning();

  if (!updated) {
    throw new RunError("conflict", "Cannot promote — run is not WAITING_CI");
  }
  await releaseRunEstimate(db, updated);
  return updated;
}

export async function markRunAwaitingReview(
  db: Database,
  input: {
    runId: string;
    workerId: string;
    branchName: string;
    headSha: string;
    prNumber: number;
    prUrl: string;
    actualCostMicros: number;
    previewUrl?: string | null;
  },
): Promise<AgentRun> {
  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "REVIEW_REQUIRED",
      branchName: input.branchName,
      headSha: input.headSha,
      prNumber: input.prNumber,
      prUrl: input.prUrl,
      actualCostMicros: input.actualCostMicros,
      previewUrl: input.previewUrl ?? null,
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
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
      "Cannot complete run — not owner or not RUNNING/VALIDATING",
    );
  }
  await releaseRunEstimate(db, updated);
  return updated;
}

export async function markRunFailed(
  db: Database,
  input: {
    runId: string;
    workerId: string;
    errorCode: string;
    errorMessage: string;
  },
): Promise<AgentRun> {
  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "FAILED",
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
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
      "Cannot fail run — not owner or not RUNNING/VALIDATING",
    );
  }
  await releaseRunEstimate(db, updated);
  return updated;
}

/** Soft-cancel terminal: run → CANCELLED (not FAILED). */
export async function markRunCancelled(
  db: Database,
  input: {
    runId: string;
    workerId: string;
    errorMessage?: string;
  },
): Promise<AgentRun> {
  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "CANCELLED",
      errorCode: "cancelled",
      errorMessage: input.errorMessage ?? "Run cancelled",
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
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
      "Cannot cancel run — not owner or not RUNNING/VALIDATING",
    );
  }
  await releaseRunEstimate(db, updated);
  return updated;
}
