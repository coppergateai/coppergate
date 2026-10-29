/**
 * AG-031 / AG-032 — stale WAITING_CI timeout reviews:
 * dirty PR → merge_conflict signal; otherwise request_changes → NEEDS_REPLAN.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  decideTaskReview,
  ensureMergeConflictSignal,
  getRunCiFitness,
  listRunsForTask,
  recordAuditEvent,
  selectAutoAcceptRun,
  shouldEmitMergeConflictInsteadOfReplan,
  shouldRequestChangesForStaleCiTimeoutReview,
  tasks,
  type Database,
} from "@coppergate/db";
import { getPullRequestMergeState } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

export async function healStaleReviewsOrEmitConflict(
  db: Database,
  log: Logger,
  input: {
    workspaceId: string;
    projectId: string;
    owner: string;
    repo: string;
    token: string;
    actor: string;
  },
): Promise<{ conflictSignals: number; replanned: number }> {
  let conflictSignals = 0;
  let replanned = 0;

  const pending = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, ["REVIEW_REQUIRED", "WAITING_CI"]),
      ),
    )
    .limit(20);

  for (const task of pending) {
    if (task.githubPrNumber != null) continue;
    const runs = await listRunsForTask(db, input.workspaceId, task.id);
    const hitTimeout = runs.some((r) => r.errorCode === "waiting_ci_timeout");
    const candidate = selectAutoAcceptRun(runs);
    let acceptReady = false;
    if (candidate) {
      try {
        acceptReady = (await getRunCiFitness(db, candidate.id)).acceptReady;
      } catch {
        acceptReady = false;
      }
    }
    if (
      !shouldRequestChangesForStaleCiTimeoutReview({
        taskStatus: task.status,
        acceptReady,
        hasWaitingCiTimeout: hitTimeout,
        taskUpdatedAt: task.updatedAt,
      })
    ) {
      continue;
    }

    const prNumber = candidate?.prNumber ?? null;
    if (prNumber != null && prNumber > 0) {
      try {
        const pr = await getPullRequestMergeState({
          token: input.token,
          owner: input.owner,
          repo: input.repo,
          prNumber,
        });
        if (
          shouldEmitMergeConflictInsteadOfReplan({
            prOpen: pr.state === "open" && !pr.merged,
            merged: pr.merged,
            mergeable: pr.mergeable,
            mergeableState: pr.mergeableState,
          })
        ) {
          const signal = await ensureMergeConflictSignal(db, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            actor: input.actor,
            owner: input.owner,
            repo: input.repo,
            prNumber,
            headRef: pr.headRef,
            headSha: pr.headSha,
            baseRef: pr.baseRef,
            parentTitle: task.title,
          });
          conflictSignals += 1;
          log.info("merge_conflict signal for stale review", {
            projectId: input.projectId,
            taskId: task.id,
            prNumber,
            ingested: signal.ingested,
            duplicate: signal.duplicate,
            armed: signal.armed,
            signalId: signal.signalId,
          });
          continue;
        }
      } catch (err) {
        log.warn("merge conflict check failed — falling back to replan", {
          taskId: task.id,
          prNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      await decideTaskReview(db, {
        workspaceId: input.workspaceId,
        taskId: task.id,
        actor: input.actor,
        decision: "request_changes",
        note: "unattended: waiting_ci_timeout without accept-ready — free board for ship-gate / replan",
      });
      await recordAuditEvent(db, {
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "review.stale_ci_timeout_replan",
        targetType: "task",
        targetId: task.id,
        meta: {
          projectId: input.projectId,
          runId: candidate?.id ?? null,
        },
      });
      replanned += 1;
    } catch (err) {
      log.warn("stale review request_changes failed", {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { conflictSignals, replanned };
}
