/**
 * Maintainer scheduler tick + unattended L2 merge for maintainer-mode projects.
 */
import {
  buildMaintainerReleaseTag,
  getInstallationForWorkspace,
  getProjectForWorkspace,
  listAutoMergeCandidates,
  markAutoMerged,
  parseMaintainerPolicy,
  recordAuditEvent,
  tickAllMaintainerProjects,
  type Database,
  type GithubInstallation,
} from "@coppergate/db";
import {
  createGithubRelease,
  formatReleaseNotes,
  mergePullRequest,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

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
  const ticks = await tickAllMaintainerProjects(db, actor);
  let merged = 0;
  let releases = 0;
  let autoAccepted = 0;

  for (const tick of ticks) {
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
    if (!policy.autoMerge || !bound.project.mergeEnabled) continue;
    if (bound.project.autonomyLevel !== "L2") continue;

    const installation = await getInstallationForWorkspace(
      db,
      tick.workspaceId,
    );
    if (!installation || !opts?.resolveToken) {
      continue;
    }

    let token: string;
    try {
      token = await opts.resolveToken(db, installation);
    } catch (err) {
      log.warn("maintainer token resolve failed", {
        projectId: tick.projectId,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

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
        await recordAuditEvent(db, {
          workspaceId: tick.workspaceId,
          actor,
          action: "merge.attempt",
          targetType: "merge",
          targetId: c.task.id,
          meta: {
            prNumber: c.prNumber,
            merged: result.merged,
            message: result.message,
            maintainer: true,
          },
        });
        if (result.merged) {
          merged += 1;
          mergedTitles.push(c.task.title);
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
    projects: ticks.length,
    autoAccepted,
    merged,
    releases,
  });

  return {
    projects: ticks.length,
    autoAccepted,
    merged,
    releases,
  };
}
