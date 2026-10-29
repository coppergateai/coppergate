/**
 * Recover missed GitHub check_run / status webhooks so auto-accept can proceed.
 * After a short grace, empty check lists become vacuous "no required checks" evidence
 * so WAITING_CI can promote and free concurrency slots on repos without CI —
 * but only when no required check names are configured (see resolveRequiredCheckNames).
 * Merged/closed PRs leave WAITING_CI immediately (no vacuous spam).
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  getInstallationForWorkspace,
  getProjectForWorkspace,
  getRunCiFitness,
  ingestCiEvidence,
  listMaintainerProjects,
  listRunsForTask,
  resolveRequiredCheckNames,
  resolveWaitingCiForPrOutcome,
  selectCiRefreshRun,
  tasks,
  type Database,
} from "@coppergate/db";
import {
  fetchCommitCheckEvidence,
  getPullRequestMergeState,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";
import type { ResolveInstallationToken } from "./maintainer-tick.js";

/** Wait this long after PR/delivery finish before treating empty CI as vacuous pass. */
export const VACUOUS_NO_CI_GRACE_MS = 5 * 60_000;

export const VACUOUS_NO_CI_CHECK_NAME = "no_required_checks";

/** Exported for unit tests. */
export function pastVacuousGrace(
  finishedAt: Date | null | undefined,
  nowMs: number,
  graceMs: number = VACUOUS_NO_CI_GRACE_MS,
): boolean {
  if (!finishedAt) return false;
  return nowMs - finishedAt.getTime() >= graceMs;
}

export async function refreshPendingCiEvidence(
  db: Database,
  log: Logger,
  opts: { resolveToken: ResolveInstallationToken; nowMs?: number },
): Promise<{ refreshed: number; attached: number; vacuous: number }> {
  const projects = await listMaintainerProjects(db);
  let refreshed = 0;
  let attached = 0;
  let vacuous = 0;
  const nowMs = opts.nowMs ?? Date.now();

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
      // Imported PR review tasks are not Coppergate-delivered WAITING_CI work.
      if (task.githubPrNumber != null) continue;
      const runs = await listRunsForTask(db, project.workspaceId, task.id);
      // Must not require tournament WINNER — scoring waits on CI promotion.
      const candidate = selectCiRefreshRun(runs);
      if (!candidate?.headSha || candidate.headSha === "unknown") continue;

      const fitness = await getRunCiFitness(db, candidate.id);
      if (fitness.acceptReady) continue;

      refreshed += 1;
      try {
        // Merged/closed delivery PR → leave WAITING_CI (do not vacuous-poll forever).
        if (
          candidate.status === "WAITING_CI" &&
          candidate.prNumber != null &&
          candidate.prNumber > 0
        ) {
          try {
            const pr = await getPullRequestMergeState({
              token,
              owner,
              repo: name,
              prNumber: candidate.prNumber,
            });
            if (pr.merged || pr.state === "closed") {
              await resolveWaitingCiForPrOutcome(db, {
                workspaceId: project.workspaceId,
                runId: candidate.id,
                outcome: pr.merged ? "merged" : "closed_unmerged",
                actor: "system:ci-refresh",
              });
              attached += 1;
              continue;
            }
          } catch (err) {
            log.warn("ci refresh PR state failed", {
              projectId: project.id,
              taskId: task.id,
              prNumber: candidate.prNumber,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const evidence = await fetchCommitCheckEvidence({
          token,
          owner,
          repo: name,
          headSha: candidate.headSha,
        });

        if (evidence.length === 0) {
          const requiredNames = resolveRequiredCheckNames();
          // Do not attach vacuous success while required contexts are configured —
          // that never satisfies scoreCiChecks and only spams artifacts.
          if (
            requiredNames.length === 0 &&
            pastVacuousGrace(candidate.finishedAt, nowMs) &&
            !fitness.ciSatisfied
          ) {
            const result = await ingestCiEvidence(db, {
              workspaceId: project.workspaceId,
              headSha: candidate.headSha,
              name: VACUOUS_NO_CI_CHECK_NAME,
              status: "completed",
              conclusion: "success",
              passed: true,
              blocksAccept: false,
              checkRunId: null,
              detailsUrl: null,
              repoFullName: `${owner}/${name}`,
            });
            if (result.attached) {
              attached += 1;
              vacuous += 1;
            }
          }
          continue;
        }

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
    log.info("ci evidence refreshed from GitHub", {
      refreshed,
      attached,
      vacuous,
    });
  }
  return { refreshed, attached, vacuous };
}
