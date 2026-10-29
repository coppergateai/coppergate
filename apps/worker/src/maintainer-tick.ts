/**
 * Maintainer scheduler tick + unattended L2 merge for maintainer-mode projects.
 */
import {
  buildMaintainerReleaseTag,
  ensureMergeConflictSignal,
  ensureShipGateHealTask,
  getInstallationForWorkspace,
  getProjectForWorkspace,
  isMergeProtectionBlock,
  isShipGateHealTitle,
  isTransientNotMergeable,
  listAutoMergeCandidates,
  listMaintainerProjects,
  markAutoMerged,
  parseMaintainerPolicy,
  reconcileStaleEstimateReserves,
  recordAuditEvent,
  recordMaintainerReleaseOutcome,
  shipGateMergeMode,
  shouldEmitMergeConflictInsteadOfReplan,
  shouldRunMaintainerRelease,
  tickMaintainerProject,
  type Database,
  type GithubInstallation,
  type ShipGateMergeMode,
} from "@coppergate/db";
import {
  commitCheckSuitesShipGate,
  countOpenShipRollbackPrs,
  buildMaintainerReleaseRequest,
  createGithubRelease,
  getPullRequestMergeState,
  getRepoDefaultBranchHead,
  mergePullRequest,
} from "@coppergate/github";
import { resolveDefaultBranchMergeFlag } from "@coppergate/scm";
import type { Logger } from "@coppergate/telemetry";
import { writeArchitectureTaskDone } from "./architecture-writeback.js";
import { runCommunityScoutForProject } from "./community-scout-tick.js";
import { runDesignScoutForProject } from "./design-scout-tick.js";
import { refreshPendingCiEvidence } from "./refresh-ci-evidence.js";
import { maybeShipRollbackForProject } from "./ship-rollback.js";
import { healStaleReviewsOrEmitConflict } from "./stale-review-heal.js";

export type ResolveInstallationToken = (
  db: Database,
  installation: GithubInstallation,
) => Promise<string>;

/** Dedupe ship-gate audit spam (Mission Control reads latest halt). */
const SHIP_GATE_AUDIT_MIN_MS = 15 * 60_000;
const lastShipGateAuditAt = new Map<string, number>();

function shouldRecordShipGateAudit(
  projectId: string,
  reason: string,
  nowMs: number = Date.now(),
): boolean {
  const key = `${projectId}:${reason}`;
  const prev = lastShipGateAuditAt.get(key) ?? 0;
  if (nowMs - prev < SHIP_GATE_AUDIT_MIN_MS) return false;
  lastShipGateAuditAt.set(key, nowMs);
  return true;
}

/** Exported for unit tests. */
export { shouldRecordShipGateAudit, SHIP_GATE_AUDIT_MIN_MS };

export async function runMaintainerSchedulerTick(
  db: Database,
  log: Logger,
  opts?: {
    resolveToken?: ResolveInstallationToken;
    actor?: string;
  },
): Promise<{
  projects: number;
  autoAccepted: number;
  merged: number;
  releases: number;
}> {
  const actor = opts?.actor ?? "system:maintainer";

  if (opts?.resolveToken) {
    try {
      await refreshPendingCiEvidence(db, log, {
        resolveToken: opts.resolveToken,
      });
    } catch (err) {
      log.warn("ci evidence refresh skipped", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const projects = await listMaintainerProjects(db);
  let merged = 0;
  let releases = 0;
  let autoAccepted = 0;

  for (const project of projects) {
    let architectureToken: string | null = null;
    const installation = await getInstallationForWorkspace(
      db,
      project.workspaceId,
    );
    if (installation && opts?.resolveToken) {
      try {
        architectureToken = await opts.resolveToken(db, installation);
      } catch (err) {
        log.warn("architecture token resolve failed", {
          projectId: project.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const tick = await tickMaintainerProject(db, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      actor,
      architectureToken,
    });
    autoAccepted += tick.autoAccepted;
    if (tick.errors.length) {
      log.warn("maintainer tick errors", {
        projectId: tick.projectId,
        errors: tick.errors,
      });
    }

    const bound = await getProjectForWorkspace(
      db,
      tick.workspaceId,
      tick.projectId,
    );
    if (!bound) continue;

    const policy = parseMaintainerPolicy(bound.project.maintainerPolicyJson);
    if (bound.project.autonomyLevel !== "L2") continue;
    if (!installation || !opts?.resolveToken || !architectureToken) continue;

    const token = architectureToken;

    try {
      await runCommunityScoutForProject(db, log, {
        workspaceId: tick.workspaceId,
        project: bound.project,
        token,
      });
    } catch (err) {
      log.warn("community scout failed", {
        projectId: tick.projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await runDesignScoutForProject(db, log, {
        workspaceId: tick.workspaceId,
        project: bound.project,
        token,
      });
    } catch (err) {
      log.warn("design scout failed", {
        projectId: tick.projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (policy.shipRollbackOnCiFail) {
      const [ownerRb, nameRb] = bound.repository.baseRepoFullName.split("/");
      if (ownerRb && nameRb) {
        try {
          await maybeShipRollbackForProject(db, log, {
            workspaceId: tick.workspaceId,
            projectId: tick.projectId,
            owner: ownerRb,
            repo: nameRb,
            token,
            actor,
          });
        } catch (err) {
          log.warn("ship rollback tick failed", {
            projectId: tick.projectId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (!policy.autoMerge || !bound.project.mergeEnabled) continue;

    const [owner, name] = bound.repository.baseRepoFullName.split("/");
    if (!owner || !name) continue;

    // Ship gate: tip not green / open rollback → halt product merges.
    // AG-034: tip red still lands `[ship-gate]` heal PRs (heal-only) so AG-031
    // enqueue cannot deadlock waiting for a human merge.
    let mergeMode: ShipGateMergeMode = "all";
    if (policy.shipRollbackOnCiFail) {
      try {
        const openRollbacks = await countOpenShipRollbackPrs({
          token,
          owner,
          repo: name,
        });
        const head = await getRepoDefaultBranchHead({
          token,
          owner,
          repo: name,
        });
        const tip = head
          ? await commitCheckSuitesShipGate({
              token,
              owner,
              repo: name,
              sha: head.sha,
            })
          : ({ kind: "pending" } as const);
        mergeMode = shipGateMergeMode({
          tipKind: tip.kind,
          openRollbacks,
        });
        if (mergeMode !== "all") {
          const reason =
            openRollbacks > 0
              ? "open_ship_rollback"
              : tip.kind === "red"
                ? "default_branch_ci_red"
                : "default_branch_ci_pending";
          log.info("auto-merge halted — ship gate", {
            projectId: tick.projectId,
            reason,
            mergeMode,
            openRollbacks,
            tipKind: tip.kind,
            headSha: head?.sha?.slice(0, 8),
          });
          if (shouldRecordShipGateAudit(tick.projectId, reason)) {
            await recordAuditEvent(db, {
              workspaceId: tick.workspaceId,
              actor,
              action: "merge.halted_ci_red",
              targetType: "project",
              targetId: tick.projectId,
              meta: {
                projectId: tick.projectId,
                reason,
                mergeMode,
                openRollbacks,
                tipKind: tip.kind,
                headSha: head?.sha ?? null,
                defaultBranch: head?.defaultBranch ?? null,
                cta:
                  openRollbacks > 0
                    ? "Merge or close the open ship-rollback PR, then fix default-branch CI"
                    : tip.kind === "pending"
                      ? "Wait for default-branch CI to finish green before auto-merge resumes"
                      : "Product merges halted; `[ship-gate]` heal PRs still auto-merge until tip is green",
              },
            });
          }
          // AG-031: tip red must enqueue heal work — halt alone deadlocks dogfood.
          if (tip.kind === "red" && head?.sha) {
            try {
              const heal = await ensureShipGateHealTask(db, {
                workspaceId: tick.workspaceId,
                projectId: tick.projectId,
                actor,
                headSha: head.sha,
                defaultBranch: head.defaultBranch,
              });
              log.info("ship-gate heal ensured", {
                projectId: tick.projectId,
                created: heal.created,
                queued: heal.queued,
                taskId: heal.taskId,
                skippedReason: heal.skippedReason,
              });
            } catch (err) {
              log.warn("ship-gate heal enqueue failed", {
                projectId: tick.projectId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          if (mergeMode === "halt") {
            continue;
          }
        }
      } catch (err) {
        log.warn("ship gate check failed — skipping auto-merge this tick", {
          projectId: tick.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    if (mergeMode === "all") {
      try {
        const stale = await healStaleReviewsOrEmitConflict(db, log, {
          workspaceId: tick.workspaceId,
          projectId: tick.projectId,
          owner,
          repo: name,
          token,
          actor,
        });
        if (
          stale.conflictSignals ||
          stale.deliveryHeals ||
          stale.replanned
        ) {
          log.info("stale review heal", {
            projectId: tick.projectId,
            conflictSignals: stale.conflictSignals,
            deliveryHeals: stale.deliveryHeals,
            replanned: stale.replanned,
          });
        }
      } catch (err) {
        log.warn("stale review heal failed", {
          projectId: tick.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const allCandidates = await listAutoMergeCandidates(db, tick.projectId);
    const candidates =
      mergeMode === "heal_only"
        ? allCandidates.filter((c) => isShipGateHealTitle(c.task.title))
        : allCandidates;
    if (mergeMode === "heal_only") {
      log.info("ship-gate heal-only merge pass", {
        projectId: tick.projectId,
        healCandidates: candidates.length,
        skippedProduct: allCandidates.length - candidates.length,
      });
    }
    const mergedTitles: string[] = [];

    for (const c of candidates) {
      try {
        const result = await mergePullRequest({
          token,
          owner,
          repo: name,
          prNumber: c.prNumber,
          allowDefaultBranchWrite: resolveDefaultBranchMergeFlag({
            mergeEnabled: bound.project.mergeEnabled,
            via: "maintainer",
            maintainerAutoMerge: policy.autoMerge,
          }),
        });
        await markAutoMerged(db, {
          workspaceId: tick.workspaceId,
          projectId: tick.projectId,
          taskId: c.task.id,
          prNumber: c.prNumber,
          merged: result.merged,
          message: result.message,
        });
        const blocked =
          !result.merged && isMergeProtectionBlock(result.message);
        await recordAuditEvent(db, {
          workspaceId: tick.workspaceId,
          actor,
          action: blocked ? "merge.blocked" : "merge.attempt",
          targetType: "merge",
          targetId: c.task.id,
          meta: {
            projectId: tick.projectId,
            taskId: c.task.id,
            prNumber: c.prNumber,
            merged: result.merged,
            message: result.message,
            maintainer: true,
            blocked,
            shipGateHealOnly: mergeMode === "heal_only",
            cta: blocked
              ? "Fix GitHub branch protection / CODEOWNERS so the Coppergate App can merge, then clear merge.blocked"
              : undefined,
          },
        });
        if (result.merged) {
          merged += 1;
          if (mergeMode === "all") {
            mergedTitles.push(c.task.title);
          }
          try {
            await writeArchitectureTaskDone(log, {
              token,
              taskTitle: c.task.title,
              prNumber: c.prNumber,
            });
          } catch (err) {
            log.warn("architecture writeback skipped", {
              prNumber: c.prNumber,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (blocked) {
          log.info("merge blocked — will not retry", {
            projectId: tick.projectId,
            prNumber: c.prNumber,
            message: result.message.slice(0, 160),
          });
        } else if (isTransientNotMergeable(result.message)) {
          try {
            const pr = await getPullRequestMergeState({
              token,
              owner,
              repo: name,
              prNumber: c.prNumber,
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
                workspaceId: tick.workspaceId,
                projectId: tick.projectId,
                actor,
                owner,
                repo: name,
                prNumber: c.prNumber,
                headRef: pr.headRef,
                headSha: pr.headSha,
                baseRef: pr.baseRef,
                parentTitle: c.task.title,
              });
              log.info("merge_conflict signal after not-mergeable", {
                projectId: tick.projectId,
                prNumber: c.prNumber,
                ingested: signal.ingested,
                duplicate: signal.duplicate,
                armed: signal.armed,
              });
            }
          } catch (err) {
            log.warn("merge_conflict emit after not-mergeable failed", {
              prNumber: c.prNumber,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        log.warn("maintainer auto-merge failed", {
          taskId: c.task.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (
      shouldRunMaintainerRelease({
        autoRelease: policy.autoRelease,
        mergedTitles,
      })
    ) {
      try {
        const tag = buildMaintainerReleaseTag(
          policy.releaseTagStyle,
          new Date(),
          mergedTitles.length,
        );
        const req = buildMaintainerReleaseRequest({
          tagName: tag,
          highlights: mergedTitles,
        });
        const release = await createGithubRelease({
          token,
          owner,
          repo: name,
          tagName: req.tagName,
          name: req.name,
          body: req.body,
          allowRelease: policy.autoRelease,
        });
        releases += 1;
        await recordMaintainerReleaseOutcome(db, {
          workspaceId: tick.workspaceId,
          projectId: tick.projectId,
          actor,
          tagName: release.tagName,
          htmlUrl: release.htmlUrl,
          releaseTagStyle: policy.releaseTagStyle,
          mergeCount: mergedTitles.length,
          highlights: mergedTitles,
        });
      } catch (err) {
        log.warn("maintainer release skipped", {
          projectId: tick.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Release estimate holds no longer backed by active runs (prevents envelope starvation).
  const workspaceIds = [...new Set(projects.map((p) => p.workspaceId))];
  let reservesReleasedUsd = 0;
  for (const workspaceId of workspaceIds) {
    try {
      const reconciled = await reconcileStaleEstimateReserves(db, {
        workspaceId,
        dryRun: false,
      });
      if (reconciled.releasedMicros > 0) {
        reservesReleasedUsd += reconciled.releasedMicros / 1_000_000;
        log.info("stale estimate reserves reconciled", {
          workspaceId,
          tasks: reconciled.rows.length,
          releasedUsd: Number(
            (reconciled.releasedMicros / 1_000_000).toFixed(4),
          ),
        });
      }
    } catch (err) {
      log.warn("stale reserve reconcile skipped", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("maintainer scheduler tick", {
    projects: projects.length,
    autoAccepted,
    merged,
    releases,
    reservesReleasedUsd: Number(reservesReleasedUsd.toFixed(4)),
  });

  return {
    projects: projects.length,
    autoAccepted,
    merged,
    releases,
  };
}
