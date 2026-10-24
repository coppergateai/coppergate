/**
 * Recover missed GitHub check_run / status webhooks so auto-accept can proceed.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  getInstallationForWorkspace,
  getProjectForWorkspace,
  getRunCiFitness,
  ingestCiEvidence,
  listMaintainerProjects,
  listRunsForTask,
  selectAutoAcceptRun,
  tasks,
  type Database,
} from "@coppergate/db";
import { fetchCommitCheckEvidence } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";
import type { ResolveInstallationToken } from "./maintainer-tick.js";

export async function refreshPendingCiEvidence(
  db: Database,
  log: Logger,
  opts: { resolveToken: ResolveInstallationToken },
): Promise<{ refreshed: number; attached: number }> {
  const projects = await listMaintainerProjects(db);
  let refreshed = 0;
  let attached = 0;

  for (const project of projects) {
    const pending = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, project.id),
          eq(tasks.workspaceId, project.workspaceId),
          inArray(tasks.status, ["REVIEW_REQUIRED", "WAITING_CI"]),
        ),
      )
      .limit(20);

    if (pending.length === 0) continue;

    const bound = await getProjectForWorkspace(
      db,
      project.workspaceId,
      project.id,
    );
    if (!bound) continue;
    const [owner, name] = bound.repository.baseRepoFullName.split("/");
    if (!owner || !name) continue;

    const installation = await getInstallationForWorkspace(
      db,
      project.workspaceId,
    );
    if (!installation) continue;

    let token: string;
    try {
      token = await opts.resolveToken(db, installation);
    } catch (err) {
      log.warn("ci refresh token failed", {
        projectId: project.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const task of pending) {
      if (task.githubPrNumber != null) continue;
      const runs = await listRunsForTask(db, project.workspaceId, task.id);
      const candidate = selectAutoAcceptRun(runs);
      if (!candidate?.headSha || candidate.headSha === "unknown") continue;

      const fitness = await getRunCiFitness(db, candidate.id);
      if (fitness.acceptReady) continue;

      refreshed += 1;
      try {
        const evidence = await fetchCommitCheckEvidence({
          token,
          owner,
          repo: name,
          headSha: candidate.headSha,
        });
        for (const ev of evidence) {
          if (!ev.passed && !ev.blocksAccept && ev.status !== "completed") {
            continue;
          }
          const result = await ingestCiEvidence(db, {
            workspaceId: project.workspaceId,
            headSha: ev.headSha ?? candidate.headSha,
            name: ev.name,
            status: ev.status,
            conclusion: ev.conclusion,
            passed: ev.passed,
            blocksAccept: ev.blocksAccept,
            checkRunId: ev.checkRunId,
            detailsUrl: ev.detailsUrl,
            repoFullName: ev.repoFullName,
          });
          if (result.attached) attached += 1;
        }
      } catch (err) {
        log.warn("ci refresh poll failed", {
          projectId: project.id,
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (refreshed > 0) {
    log.info("ci evidence refreshed from GitHub", { refreshed, attached });
  }
  return { refreshed, attached };
}
