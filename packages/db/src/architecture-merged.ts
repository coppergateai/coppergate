/**
 * Open Program IDs shipped by merged PRs on the product repo's default branch.
 * Feeds replan dedupe and architecture Done reconcile — independent of whether
 * the merge came from maintainer auto-merge or a human.
 */
import { and, eq } from "drizzle-orm";
import { extractArchitectureIdFromTitle } from "./architecture-backlog.js";
import { recordAuditEvent } from "./briefs.js";
import type { Database } from "./client.js";
import { tasks } from "./schema.js";
import { applyTaskTransition } from "./task-transitions.js";

type MergedPullRow = {
  number?: number;
  title?: string;
  merged_at?: string | null;
  base?: { ref?: string; repo?: { default_branch?: string } };
};

/** Map of Open ID → most recent merged PR number citing it in the title. */
export async function listMergedArchitectureIds(input: {
  token: string;
  owner: string;
  repo: string;
  /** Most recently updated closed PRs to scan (max 100). */
  perPage?: number;
  fetchImpl?: typeof fetch;
}): Promise<Map<string, number>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const perPage = Math.min(Math.max(input.perPage ?? 100, 1), 100);
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${perPage}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`list merged PRs failed (${res.status})`);
  }
  const rows = (await res.json()) as MergedPullRow[];
  const ids = new Map<string, number>();
  for (const pr of rows) {
    if (!pr.merged_at || typeof pr.number !== "number") continue;
    const title = pr.title ?? "";
    // Reverts undo the ship; they must not count as delivering the ID.
    if (/^revert\b/i.test(title.trim())) continue;
    const defaultBranch = pr.base?.repo?.default_branch;
    if (defaultBranch && pr.base?.ref && pr.base.ref !== defaultBranch) continue;
    const id = extractArchitectureIdFromTitle(title);
    if (id && !ids.has(id)) ids.set(id, pr.number);
  }
  return ids;
}

/**
 * FAILED tasks whose Open ID already shipped via a merged PR are stale board
 * noise (Evidence "failures" for work that is on main). Close them as
 * CANCELLED with the shipping PR in the reason. Returns the closed task ids.
 */
export async function closeFailedTasksShippedByMergedPrs(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    merged: Map<string, number>;
    actor: string;
  },
): Promise<string[]> {
  if (input.merged.size === 0) return [];
  const failed = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.projectId, input.projectId),
        eq(tasks.status, "FAILED"),
      ),
    )
    .limit(200);
  const closed: string[] = [];
  for (const task of failed) {
    const id = extractArchitectureIdFromTitle(task.title);
    const prNumber = id ? input.merged.get(id) : undefined;
    if (!id || prNumber == null) continue;
    await applyTaskTransition(db, {
      workspaceId: input.workspaceId,
      taskId: task.id,
      toStatus: "CANCELLED",
      actor: input.actor,
      reason: `${id} shipped by merged PR #${prNumber} — stale FAILED attempt closed`,
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "task.closed_shipped",
      targetType: "task",
      targetId: task.id,
      meta: { projectId: input.projectId, architectureId: id, prNumber },
    });
    closed.push(task.id);
  }
  return closed;
}
