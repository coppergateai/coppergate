/**
 * Leave WAITING_CI when the delivery PR is already merged or closed.
 * Prevents orphan runs that poll vacuous CI forever after the PR is gone.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { releaseEstimateForRun } from "./budgets.js";
import { promoteRunFromWaitingCi } from "./run-events.js";
import { agentRuns, tasks, type AgentRun } from "./schema.js";
import { applyTaskTransition } from "./task-transitions.js";

export type PrCiOutcome = "merged" | "closed_unmerged";

export async function listWaitingCiRunsForPr(
  db: Database,
  input: { workspaceId: string; prNumber: number },
): Promise<AgentRun[]> {
  return db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.prNumber, input.prNumber),
        eq(agentRuns.status, "WAITING_CI"),
      ),
    );
}

/**
 * merged → REVIEW_REQUIRED (work already landed; Accept/maintainer can finish).
 * closed_unmerged → FAILED (PR abandoned before CI cleared).
 */
export async function resolveWaitingCiForPrOutcome(
  db: Database,
  input: {
    workspaceId: string;
    runId: string;
    outcome: PrCiOutcome;
    actor: string;
  },
): Promise<{ run: AgentRun | null; taskStatus: string | null }> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, input.runId),
        eq(agentRuns.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!run || run.status !== "WAITING_CI") {
    return { run: run ?? null, taskStatus: null };
  }

  if (input.outcome === "merged") {
    const promoted = await promoteRunFromWaitingCi(db, run.id);
    let taskStatus: string | null = null;
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, run.taskId))
      .limit(1);
    if (task?.status === "WAITING_CI") {
      const t = await applyTaskTransition(db, {
        workspaceId: input.workspaceId,
        taskId: run.taskId,
        toStatus: "REVIEW_REQUIRED",
        actor: input.actor,
        reason: "PR merged — leave WAITING_CI",
      });
      taskStatus = t.task.status;
    } else {
      taskStatus = task?.status ?? null;
    }
    return { run: promoted, taskStatus };
  }

  const now = new Date();
  const [failed] = await db
    .update(agentRuns)
    .set({
      status: "FAILED",
      errorCode: "pr_closed_before_ci",
      errorMessage: "Pull request closed before CI cleared WAITING_CI",
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentRuns.id, run.id), eq(agentRuns.status, "WAITING_CI")))
    .returning();

  if (failed) {
    try {
      await releaseEstimateForRun(db, {
        workspaceId: input.workspaceId,
        projectId: failed.projectId,
        taskId: failed.taskId,
        runId: failed.id,
        amountMicros: failed.estimatedCostMicros || 0,
      });
    } catch {
      /* ignore */
    }
  }

  let taskStatus: string | null = null;
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, run.taskId))
    .limit(1);
  if (task?.status === "WAITING_CI") {
    const t = await applyTaskTransition(db, {
      workspaceId: input.workspaceId,
      taskId: run.taskId,
      toStatus: "FAILED",
      actor: input.actor,
      reason: "PR closed before CI cleared WAITING_CI",
    });
    taskStatus = t.task.status;
  } else {
    taskStatus = task?.status ?? null;
  }

  return { run: failed ?? run, taskStatus };
}

/** Resolve every WAITING_CI run for a PR number in a workspace. */
export async function resolveWaitingCiRunsForPr(
  db: Database,
  input: {
    workspaceId: string;
    prNumber: number;
    outcome: PrCiOutcome;
    actor: string;
  },
): Promise<number> {
  const runs = await listWaitingCiRunsForPr(db, {
    workspaceId: input.workspaceId,
    prNumber: input.prNumber,
  });
  let n = 0;
  for (const run of runs) {
    await resolveWaitingCiForPrOutcome(db, {
      workspaceId: input.workspaceId,
      runId: run.id,
      outcome: input.outcome,
      actor: input.actor,
    });
    n += 1;
  }
  return n;
}
