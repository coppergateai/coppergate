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

/** Workspace-scoped event list (IDOR fail-closed). */
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

/** Move claimed run into VALIDATING (still leased by worker). */
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

/**
 * Apply fake agent completion metadata and move run → REVIEW_REQUIRED.
 * Does NOT mark DONE (FR-04).
 */
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
