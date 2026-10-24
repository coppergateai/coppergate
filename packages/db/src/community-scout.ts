import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  parseArchitectureOpenTasks,
  type ArchitectureOpenTask,
} from "./architecture-backlog.js";
import { maintainerEvents } from "./schema.js";

export type CommunityIssueCandidate = {
  title: string;
  body: string;
  architectureId?: string;
};

export type OpenIssueRef = {
  title: string;
  labels?: string[];
};

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesOverlap(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 3));
  const wb = nb.split(" ").filter((w) => w.length > 3);
  if (wa.size === 0 || wb.length === 0) return false;
  let hit = 0;
  for (const w of wb) if (wa.has(w)) hit += 1;
  return hit >= Math.min(3, wb.length);
}

function isCommunityFriendly(task: ArchitectureOpenTask): boolean {
  if (task.estimateComplexity === "S") return true;
  const t = task.title.toLowerCase();
  return (
    /\b(docs?|readme|test|typo|label|changelog|comment|i18n|a11y|css|copy)\b/.test(
      t,
    ) || task.id.startsWith("W-") || task.id.startsWith("P-")
  );
}

export function formatCommunityIssueBody(task: ArchitectureOpenTask): string {
  const ac = task.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n");
  return [
    `## Goal`,
    task.goal,
    ``,
    `## Acceptance`,
    ac || "- [ ] Scoped change lands with a test or clear manual check",
    ``,
    `## Notes`,
    `Labeled **good first issue** for community contributors.`,
    `Keep blast radius small; no scaffold/empty PRs.`,
    ``,
    `---`,
    `<!-- coppergate-scout architectureId=${task.id} -->`,
  ].join("\n");
}

/**
 * Deterministic GFI candidates from architecture open tasks + title dedup.
 */
export function proposeCommunityIssues(input: {
  openIssues: OpenIssueRef[];
  architectureMarkdown?: string | null;
  max: number;
}): CommunityIssueCandidate[] {
  const max = Math.max(0, Math.min(10, Math.floor(input.max)));
  if (max === 0) return [];

  const tasks = parseArchitectureOpenTasks(input.architectureMarkdown ?? "")
    .filter(isCommunityFriendly)
    .slice(0, 40);

  const out: CommunityIssueCandidate[] = [];
  for (const task of tasks) {
    const title = `good first issue: ${task.title}`.slice(0, 200);
    const dup = input.openIssues.some(
      (i) =>
        titlesOverlap(i.title, title) ||
        titlesOverlap(i.title, task.title) ||
        (task.id && i.title.toUpperCase().includes(task.id)),
    );
    if (dup) continue;
    if (out.some((c) => titlesOverlap(c.title, title))) continue;
    out.push({
      title,
      body: formatCommunityIssueBody(task),
      architectureId: task.id,
    });
    if (out.length >= max) break;
  }

  // No fallback GFI when architecture is empty — avoids duplicate hygiene spam.
  return out.slice(0, max);
}

export async function isCommunityScoutDue(
  db: Database,
  projectId: string,
  intervalHours: number,
  now = new Date(),
): Promise<boolean> {
  const hours = Math.max(1, Math.floor(intervalHours));
  const [last] = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, projectId),
        eq(maintainerEvents.kind, "community"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(1);
  if (!last) return true;
  const elapsed = now.getTime() - last.createdAt.getTime();
  return elapsed >= hours * 60 * 60 * 1000;
}

export async function recordCommunityScoutEvent(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(maintainerEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "community",
    payload: JSON.stringify({ action: "scout", ...input.payload }),
    createdAt: new Date(),
  });
}
