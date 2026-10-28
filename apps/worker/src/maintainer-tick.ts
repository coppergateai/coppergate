/**
 * Maintainer scheduler tick + unattended L2 merge for maintainer-mode projects.
 */
import {
  buildMaintainerReleaseTag,
  getInstallationForWorkspace,
  getProjectForWorkspace,
  isMergeProtectionBlock,
  listAutoMergeCandidates,
  listMaintainerProjects,
  markAutoMerged,
  parseMaintainerPolicy,
  reconcileStaleEstimateReserves,
  recordAuditEvent,
  recordMaintainerReleaseOutcome,
  shouldRunMaintainerRelease,
  tickMaintainerProject,
  type Database,
  type GithubInstallation,
} from "@coppergate/db";
import {
  commitCheckSuitesFailed,
  countOpenShipRollbackPrs,
  buildMaintainerReleaseRequest,
  createGithubRelease,
  getRepoDefaultBranchHead,
  mergePullRequest,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";
import { writeArchitectureTaskDone } from "./architecture-writeback.js";
import { runCommunityScoutForProject } from "./community-scout-tick.js";
import { refreshPendingCiEvidence } from "./refresh-ci-evidence.js";
import { maybeShipRollbackForProject } from "./ship-rollback.js";

export type ResolveInstallationToken = (
  db: Database,
  installation: GithubInstallation,
) => Promise<string>;

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

    // Halt ship while default-branch CI is red or a rollback PR is still open.
    // Prevents merge→red→orphan-revert storms when post-merge checks fail.
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
        const headFailed = head
          ? await commitCheckSuitesFailed({
              token,
              owner,
              repo: name,
              sha: head.sha,
            })
          : false;
        if (openRollbacks > 0 || headFailed) {
          const reason =
            openRollbacks > 0 ? "open_ship_rollback" : "default_branch_ci_red";
          log.info("auto-merge halted — ship gate", {
            projectId: tick.projectId,
            reason,
            openRollbacks,
            headSha: head?.sha?.slice(0, 8),
          });
          await recordAuditEvent(db, {
            workspaceId: tick.workspaceId,
            actor,
            action: "merge.halted_ci_red",
            targetType: "project",
            targetId: tick.projectId,
            meta: {
              projectId: tick.projectId,
              reason,
              openRollbacks,
              headSha: head?.sha ?? null,
              defaultBranch: head?.defaultBranch ?? null,
              cta:
                openRollbacks > 0
                  ? "Merge or close the open ship-rollback PR, then fix default-branch CI"
                  : "Fix default-branch CI before Coppergate auto-merge resumes",
            },
          });
          continue;
        }
      } catch (err) {
        log.warn("ship gate check failed — skipping auto-merge this tick", {
          projectId: tick.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    const candidates = await listAutoMergeCandidates(db, tick.projectId);
    const mergedTitles: string[] = [];

    for (const c of candidates) {
      try {
        const result = await mergePullRequest({
          token,
          owner,
          repo: name,
          prNumber: c.prNumber,
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
            cta: blocked
              ? "Fix GitHub branch protection / CODEOWNERS so the Coppergate App can merge, then clear merge.blocked"
              : undefined,
          },
        });
        if (result.merged) {
          merged += 1;
          mergedTitles.push(c.task.title);
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
