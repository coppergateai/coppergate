/**
 * AG-031 / AG-032 / AG-033 / AG-035 / AG-036 — unattended board drain:
 * - obsolete [ship-gate] when tip green / PR closed → request_changes
 * - dirty open PR (after short grace) → merge_conflict (no 6h wait)
 * - behind open PR → GitHub update-branch (strict up-to-date); conflict → merge_conflict
 * - other open PR after waiting_ci_timeout → stale_delivery heal
 * - otherwise request_changes → NEEDS_REPLAN
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  applyTaskTransition,
  decideTaskReview,
  ensureMergeConflictSignal,
  ensureStaleDeliveryHealSignal,
  getRunCiFitness,
  isBehindMergeState,
  isShipGateHealTitle,
  listRunsForTask,
  recordAuditEvent,
  routeStaleReviewHeal,
  selectAutoAcceptRun,
  shouldInspectDeliveryPrForUnattendedHeal,
  shouldRequestChangesForStaleCiTimeoutReview,
  shouldRetireObsoleteShipGateHeal,
  tasks,
  type Database,
} from "@coppergate/db";
import {
  getPullRequestMergeState,
  updatePullRequestBranch,
} from "@coppergate/github";
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
    /** Tip ship-gate kind for retiring obsolete [ship-gate] tasks (AG-035). */
    tipKind?: "green" | "red" | "pending" | null;
  },
): Promise<{
  conflictSignals: number;
  deliveryHeals: number;
  branchUpdates: number;
  replanned: number;
  retiredShipGates: number;
}> {
  let conflictSignals = 0;
  let deliveryHeals = 0;
  let branchUpdates = 0;
  let replanned = 0;
  let retiredShipGates = 0;

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

    const prNumber = candidate?.prNumber ?? null;
    const inspectPr =
      prNumber != null &&
      prNumber > 0 &&
      shouldInspectDeliveryPrForUnattendedHeal({
        taskStatus: task.status,
        acceptReady,
        taskUpdatedAt: task.updatedAt,
      });

    let prOpen: boolean | null = null;
    let prMerged: boolean | null = null;
    let mergeable: boolean | null = null;
    let mergeableState: string | null = null;
    let headRef: string | null = null;
    let headSha: string | null = null;
    let baseRef: string | null = null;
    let mergeStateError: string | null = null;

    if (inspectPr && prNumber != null) {
      try {
        const pr = await getPullRequestMergeState({
          token: input.token,
          owner: input.owner,
          repo: input.repo,
          prNumber,
        });
        prOpen = pr.state === "open" && !pr.merged;
        prMerged = pr.merged;
        mergeable = pr.mergeable;
        mergeableState = pr.mergeableState;
        headRef = pr.headRef;
        headSha = pr.headSha;
        baseRef = pr.baseRef;
      } catch (err) {
        mergeStateError = err instanceof Error ? err.message : String(err);
      }
    }

    if (
      shouldRetireObsoleteShipGateHeal({
        taskTitle: task.title,
        tipKind: input.tipKind ?? null,
        prOpen,
        prMerged,
      })
    ) {
      try {
        await decideTaskReview(db, {
          workspaceId: input.workspaceId,
          taskId: task.id,
          actor: input.actor,
          decision: "request_changes",
          note:
            input.tipKind === "green"
              ? "unattended: tip CI green — retire obsolete [ship-gate] heal"
              : "unattended: [ship-gate] PR closed/merged — retire obsolete heal",
        });
        await recordAuditEvent(db, {
          workspaceId: input.workspaceId,
          actor: input.actor,
          action: "ship_gate.heal_retired",
          targetType: "task",
          targetId: task.id,
          meta: {
            projectId: input.projectId,
            tipKind: input.tipKind ?? null,
            prNumber,
            prOpen,
            prMerged,
          },
        });
        retiredShipGates += 1;
      } catch (err) {
        log.warn("obsolete ship-gate retire failed", {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // AG-035/036: dirty / behind / closed delivery — heal without waiting_ci_timeout.
    if (inspectPr && prNumber != null && mergeStateError == null) {
      const route = routeStaleReviewHeal({
        hasPrNumber: true,
        prOpen: Boolean(prOpen),
        merged: Boolean(prMerged),
        mergeable,
        mergeableState,
      });
      if (route === "merge_conflict") {
        const signal = await ensureMergeConflictSignal(db, {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          actor: input.actor,
          owner: input.owner,
          repo: input.repo,
          prNumber,
          headRef,
          headSha,
          baseRef,
          parentTitle: task.title,
        });
        conflictSignals += 1;
        // Free per-project concurrency so the heal task can claim.
        try {
          if (task.status === "WAITING_CI") {
            await applyTaskTransition(db, {
              workspaceId: input.workspaceId,
              taskId: task.id,
              actor: input.actor,
              toStatus: "FAILED",
              reason:
                "unattended: dirty PR — merge_conflict heal takes concurrency",
            });
          } else if (task.status === "REVIEW_REQUIRED") {
            await decideTaskReview(db, {
              workspaceId: input.workspaceId,
              taskId: task.id,
              actor: input.actor,
              decision: "request_changes",
              note: "unattended: dirty PR — merge_conflict heal owns the board",
            });
          }
        } catch (err) {
          log.warn("dirty delivery parent free failed", {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        log.info("merge_conflict signal for dirty delivery", {
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
      // AG-036: behind + strict protection → update-branch (no human Update click).
      if (
        Boolean(prOpen) &&
        !prMerged &&
        isBehindMergeState({ mergeableState })
      ) {
        try {
          const upd = await updatePullRequestBranch({
            token: input.token,
            owner: input.owner,
            repo: input.repo,
            prNumber,
            expectedHeadSha: headSha,
          });
          if (upd.updated) {
            branchUpdates += 1;
            await recordAuditEvent(db, {
              workspaceId: input.workspaceId,
              actor: input.actor,
              action: "merge.branch_updated",
              targetType: "task",
              targetId: task.id,
              meta: {
                projectId: input.projectId,
                prNumber,
                message: upd.message.slice(0, 200),
              },
            });
            log.info("update-branch for behind delivery", {
              projectId: input.projectId,
              taskId: task.id,
              prNumber,
            });
            continue;
          }
          if (upd.conflict) {
            const signal = await ensureMergeConflictSignal(db, {
              workspaceId: input.workspaceId,
              projectId: input.projectId,
              actor: input.actor,
              owner: input.owner,
              repo: input.repo,
              prNumber,
              headRef,
              headSha,
              baseRef,
              parentTitle: task.title,
            });
            conflictSignals += 1;
            try {
              if (task.status === "WAITING_CI") {
                await applyTaskTransition(db, {
                  workspaceId: input.workspaceId,
                  taskId: task.id,
                  actor: input.actor,
                  toStatus: "FAILED",
                  reason:
                    "unattended: update-branch conflict — merge_conflict heal takes concurrency",
                });
              } else if (task.status === "REVIEW_REQUIRED") {
                await decideTaskReview(db, {
                  workspaceId: input.workspaceId,
                  taskId: task.id,
                  actor: input.actor,
                  decision: "request_changes",
                  note: "unattended: update-branch conflict — merge_conflict heal owns the board",
                });
              }
            } catch (err) {
              log.warn("behind→dirty parent free failed", {
                taskId: task.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            log.info("merge_conflict after update-branch conflict", {
              projectId: input.projectId,
              taskId: task.id,
              prNumber,
              armed: signal.armed,
            });
            continue;
          }
          log.warn("update-branch failed for behind delivery", {
            taskId: task.id,
            prNumber,
            message: upd.message.slice(0, 160),
          });
        } catch (err) {
          log.warn("update-branch threw for behind delivery", {
            taskId: task.id,
            prNumber,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }
      if (route === "replan" && (prOpen === false || prMerged === true)) {
        // Closed/merged without accept — free the board (not ship-gate; those retired above).
        if (!isShipGateHealTitle(task.title)) {
          try {
            await decideTaskReview(db, {
              workspaceId: input.workspaceId,
              taskId: task.id,
              actor: input.actor,
              decision: "request_changes",
              note: prMerged
                ? "unattended: delivery PR already merged — free board for replan"
                : "unattended: delivery PR closed unmerged — free board for replan",
            });
            replanned += 1;
          } catch (err) {
            log.warn("closed-PR review drain failed", {
              taskId: task.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        continue;
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

    if (prNumber != null && prNumber > 0) {
      try {
        if (mergeStateError) throw new Error(mergeStateError);
        const route = routeStaleReviewHeal({
          hasPrNumber: true,
          prOpen: Boolean(prOpen),
          merged: Boolean(prMerged),
          mergeable,
          mergeableState,
        });
        if (route === "merge_conflict") {
          const signal = await ensureMergeConflictSignal(db, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            actor: input.actor,
            owner: input.owner,
            repo: input.repo,
            prNumber,
            headRef,
            headSha,
            baseRef,
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
        if (route === "stale_delivery") {
          const signal = await ensureStaleDeliveryHealSignal(db, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            actor: input.actor,
            owner: input.owner,
            repo: input.repo,
            prNumber,
            headRef,
            headSha,
            baseRef,
            parentTitle: task.title,
            reasonNote:
              "unattended: waiting_ci_timeout without accept-ready — same-head heal",
          });
          deliveryHeals += 1;
          await recordAuditEvent(db, {
            workspaceId: input.workspaceId,
            actor: input.actor,
            action: "review.stale_ci_timeout_heal",
            targetType: "task",
            targetId: task.id,
            meta: {
              projectId: input.projectId,
              runId: candidate?.id ?? null,
              prNumber,
              signalId: signal.signalId,
              healTaskId: signal.taskId,
              armed: signal.armed,
            },
          });
          log.info("stale_delivery heal for stale review", {
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
        try {
          const signal = await ensureStaleDeliveryHealSignal(db, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            actor: input.actor,
            owner: input.owner,
            repo: input.repo,
            prNumber,
            parentTitle: task.title,
            reasonNote:
              "unattended: waiting_ci_timeout; merge-state check failed — same-head heal fallback",
          });
          deliveryHeals += 1;
          await recordAuditEvent(db, {
            workspaceId: input.workspaceId,
            actor: input.actor,
            action: "review.stale_ci_timeout_heal",
            targetType: "task",
            targetId: task.id,
            meta: {
              projectId: input.projectId,
              runId: candidate?.id ?? null,
              prNumber,
              signalId: signal.signalId,
              healTaskId: signal.taskId,
              armed: signal.armed,
              mergeStateError:
                err instanceof Error ? err.message : String(err),
            },
          });
          log.warn(
            "merge state check failed — stale_delivery heal fallback",
            {
              taskId: task.id,
              prNumber,
              error: err instanceof Error ? err.message : String(err),
              armed: signal.armed,
            },
          );
          continue;
        } catch (healErr) {
          log.warn("stale delivery heal fallback failed — will replan", {
            taskId: task.id,
            prNumber,
            error:
              healErr instanceof Error ? healErr.message : String(healErr),
          });
        }
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

  return {
    conflictSignals,
    deliveryHeals,
    branchUpdates,
    replanned,
    retiredShipGates,
  };
}
