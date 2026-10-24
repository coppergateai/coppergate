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
  recordAuditEvent,
  tickMaintainerProject,
  type Database,
  type GithubInstallation,
} from "@coppergate/db";
import {
  createGithubRelease,
  formatReleaseNotes,
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

    if (policy.autoRelease && mergedTitles.length > 0) {
      try {
        const tag = buildMaintainerReleaseTag(
          policy.releaseTagStyle,
          new Date(),
          mergedTitles.length,
        );
        const release = await createGithubRelease({
          token,
          owner,
          repo: name,
          tagName: tag,
          name: `Maintainer ${tag}`,
          body: formatReleaseNotes({
            version: tag,
            highlights: mergedTitles.slice(0, 20),
          }),
        });
        releases += 1;
        await recordAuditEvent(db, {
          workspaceId: tick.workspaceId,
          actor,
          action: "maintainer.release",
          targetType: "project",
          targetId: tick.projectId,
          meta: {
            tagName: release.tagName,
            htmlUrl: release.htmlUrl,
            releaseTagStyle: policy.releaseTagStyle,
          },
        });
      } catch (err) {
        log.warn("maintainer release skipped", {
          projectId: tick.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  log.info("maintainer scheduler tick", {
    projects: projects.length,
    autoAccepted,
    merged,
    releases,
  });

  return {
    projects: projects.length,
    autoAccepted,
    merged,
    releases,
  };
}
