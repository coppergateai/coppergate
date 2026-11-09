/**
 * Same-head CI heal (worker side):
 * - tick: red CI on a delivery PR → queue a same-head fix run right away
 *   (instead of waiting ~6h for waiting_ci_timeout → stale heal)
 * - prompt: failing check output for the fixer
 */
import { and, eq } from "drizzle-orm";
import {
  armSameHeadHealRun,
  tasks,
  type Database,
  type SameHeadFailingCheck,
} from "@coppergate/db";
import { fetchCheckRunAnnotationSnippet } from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

/** GitHub check run id from a check / Actions job details URL. */
export function checkRunIdFromDetailsUrl(url: string | null): number | null {
  if (!url) return null;
  // Actions: …/actions/runs/<workflow run>/job/<check run>; checks: …/runs/<check run>
  const m =
    url.match(/\/job\/(\d+)(?:[/?#]|$)/) ??
    (url.includes("/actions/") ? null : url.match(/\/runs\/(\d+)(?:[/?#]|$)/));
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Best-effort annotations for the failing checks (fixer prompt context). */
export async function fetchFailingCheckOutput(input: {
  token: string;
  owner: string;
  repo: string;
  checks: SameHeadFailingCheck[];
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const parts: string[] = [];
  for (const check of input.checks.slice(0, 2)) {
    const checkRunId = checkRunIdFromDetailsUrl(check.detailsUrl);
    if (!checkRunId) continue;
    const snippet = await fetchCheckRunAnnotationSnippet({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      checkRunId,
      fetchImpl: input.fetchImpl,
      maxItems: 6,
    }).catch(() => null);
    if (snippet?.trim()) parts.push(`[${check.name}]\n${snippet.trim()}`);
  }
  return parts.length ? parts.join("\n\n") : null;
}

/**
 * Arm same-head CI heals for WAITING_CI tasks whose delivery run is ci_failed.
 * The gate (arena pause, flake cooldown, attempt cap, active run) lives in
 * `armSameHeadHealRun`; skips are quiet so the tick does not spam logs.
 */
export async function runSameHeadCiHealForProject(
  db: Database,
  log: Logger,
  input: { workspaceId: string; projectId: string; actor: string },
): Promise<{ armed: number }> {
  const waiting = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.projectId, input.projectId),
        eq(tasks.status, "WAITING_CI"),
      ),
    )
    .limit(20);

  let armed = 0;
  for (const task of waiting) {
    try {
      const res = await armSameHeadHealRun(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        taskId: task.id,
        actor: input.actor,
        reason: "ci_failure",
      });
      if (res.armed) {
        armed += 1;
        log.info("same-head CI heal armed", {
          projectId: input.projectId,
          taskId: task.id,
          runId: res.runId,
          attempt: res.attempt,
        });
      }
      // exhausted: waiting_ci_timeout → stale review → replan takes over.
    } catch (err) {
      log.warn("same-head CI heal failed", {
        projectId: input.projectId,
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { armed };
}
