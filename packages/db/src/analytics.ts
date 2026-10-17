import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { agentRuns, projects, tasks, usageEvents } from "./schema.js";

export type CostAnalytics30d = {
  windowDays: number;
  totalSpendMicros: number;
  failedRunSpendMicros: number;
  acceptedPrCount: number;
  medianAcceptedPrCostMicros: number | null;
  runCount: number;
  failedRunCount: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

/** TASK045 — owner-facing cost analytics for last N days (default 30). */
export async function getWorkspaceCostAnalytics(
  db: Database,
  input: { workspaceId: string; days?: number },
): Promise<CostAnalytics30d> {
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const usage = await db
    .select({
      cost: usageEvents.costMicros,
      runId: usageEvents.runId,
      kind: usageEvents.kind,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, input.workspaceId),
        gte(usageEvents.createdAt, since),
      ),
    );

  const totalSpendMicros = usage.reduce((s, u) => s + (u.cost || 0), 0);

  const runs = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        gte(agentRuns.createdAt, since),
      ),
    );

  const failedRuns = runs.filter((r) => r.status === "FAILED");
  const failedRunSpendMicros = failedRuns.reduce(
    (s, r) => s + (r.actualCostMicros || 0),
    0,
  );

  const acceptedTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, ["ACCEPTED", "DONE"]),
        gte(tasks.updatedAt, since),
        sql`${tasks.prUrl} is not null`,
      ),
    );

  const acceptedIds = new Set(acceptedTasks.map((t) => t.id));
  const acceptedCosts = runs
    .filter((r) => acceptedIds.has(r.taskId) && r.actualCostMicros > 0)
    .map((r) => r.actualCostMicros);

  return {
    windowDays: days,
    totalSpendMicros,
    failedRunSpendMicros,
    acceptedPrCount: acceptedTasks.length,
    medianAcceptedPrCostMicros: median(acceptedCosts),
    runCount: runs.length,
    failedRunCount: failedRuns.length,
  };
}

export type RetentionSnapshot = {
  workspacesWithAcceptedPr: number;
  secondAcceptedPrRate: number | null;
  tasksAccepted: number;
  tasksWithPr: number;
};

export type ProjectCostExplorer = {
  windowDays: number;
  spentMicros: number;
  topTasks: Array<{
    taskId: string;
    title: string | null;
    spentMicros: number;
  }>;
};

/** Project spend strip: N-day total + top tasks by usage. */
export async function getProjectCostExplorer(
  db: Database,
  input: { workspaceId: string; projectId: string; days?: number },
): Promise<ProjectCostExplorer> {
  const days = input.days ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [bound] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!bound) {
    return { windowDays: days, spentMicros: 0, topTasks: [] };
  }

  const usage = await db
    .select({
      taskId: usageEvents.taskId,
      cost: usageEvents.costMicros,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, input.workspaceId),
        eq(usageEvents.projectId, input.projectId),
        gte(usageEvents.createdAt, since),
      ),
    );

  const spentMicros = usage.reduce((s, u) => s + (u.cost || 0), 0);
  const byTask = new Map<string, number>();
  for (const u of usage) {
    if (!u.taskId) continue;
    byTask.set(u.taskId, (byTask.get(u.taskId) ?? 0) + (u.cost || 0));
  }

  const ranked = [...byTask.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const taskIds = ranked.map(([id]) => id);
  const titleById = new Map<string, string>();
  if (taskIds.length) {
    const rows = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(inArray(tasks.id, taskIds));
    for (const r of rows) titleById.set(r.id, r.title);
  }

  return {
    windowDays: days,
    spentMicros,
    topTasks: ranked.map(([taskId, cost]) => ({
      taskId,
      title: titleById.get(taskId) ?? null,
      spentMicros: cost,
    })),
  };
}

/** Month-to-date usage from the same ledger as budgets (`usage_events`). */
export async function getWorkspaceMonthToDateUsage(
  db: Database,
  workspaceId: string,
  now: Date = new Date(),
): Promise<{
  periodStart: string;
  periodLabel: string;
  spentMicros: number;
  eventCount: number;
  byKind: Array<{ kind: string; spentMicros: number; count: number }>;
}> {
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const periodLabel = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, "0")}`;

  const usage = await db
    .select({
      kind: usageEvents.kind,
      cost: usageEvents.costMicros,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, workspaceId),
        gte(usageEvents.createdAt, periodStart),
      ),
    );

  const byKindMap = new Map<string, { spentMicros: number; count: number }>();
  let spentMicros = 0;
  for (const u of usage) {
    spentMicros += u.cost || 0;
    const cur = byKindMap.get(u.kind) ?? { spentMicros: 0, count: 0 };
    cur.spentMicros += u.cost || 0;
    cur.count += 1;
    byKindMap.set(u.kind, cur);
  }

  return {
    periodStart: periodStart.toISOString(),
    periodLabel,
    spentMicros,
    eventCount: usage.length,
    byKind: [...byKindMap.entries()].map(([kind, v]) => ({
      kind,
      spentMicros: v.spentMicros,
      count: v.count,
    })),
  };
}

/** Workspace rollup for cost strip: 7d spend per project. */
export async function getWorkspaceCostExplorer(
  db: Database,
  input: { workspaceId: string; days?: number },
): Promise<{
  windowDays: number;
  spentMicros: number;
  projects: Array<{
    projectId: string;
    name: string;
    spentMicros: number;
  }>;
}> {
  const days = input.days ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const usage = await db
    .select({
      projectId: usageEvents.projectId,
      cost: usageEvents.costMicros,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, input.workspaceId),
        gte(usageEvents.createdAt, since),
      ),
    );

  const byProject = new Map<string, number>();
  for (const u of usage) {
    byProject.set(
      u.projectId,
      (byProject.get(u.projectId) ?? 0) + (u.cost || 0),
    );
  }

  const projectIds = [...byProject.keys()];
  const nameById = new Map<string, string>();
  if (projectIds.length) {
    const rows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const r of rows) nameById.set(r.id, r.name);
  }

  const projectRows = [...byProject.entries()]
    .map(([projectId, spent]) => ({
      projectId,
      name: nameById.get(projectId) ?? "Project",
      spentMicros: spent,
    }))
    .sort((a, b) => b.spentMicros - a.spentMicros);

  return {
    windowDays: days,
    spentMicros: projectRows.reduce((s, p) => s + p.spentMicros, 0),
    projects: projectRows,
  };
}

/** Count accepted/done tasks with a PR URL for one workspace (GTM second-PR). */
export async function countAcceptedPrsForWorkspace(
  db: Database,
  workspaceId: string,
): Promise<number> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.status, ["ACCEPTED", "DONE"]),
        sql`${tasks.prUrl} is not null`,
      ),
    );
  return rows.length;
}

/** TASK047 — lightweight retention snapshot for operators. */
export async function getRetentionSnapshot(
  db: Database,
): Promise<RetentionSnapshot> {
  const accepted = await db
    .select({
      workspaceId: tasks.workspaceId,
      id: tasks.id,
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, ["ACCEPTED", "DONE"]),
        sql`${tasks.prUrl} is not null`,
      ),
    );

  const byWs = new Map<string, number>();
  for (const t of accepted) {
    byWs.set(t.workspaceId, (byWs.get(t.workspaceId) ?? 0) + 1);
  }
  const withOne = [...byWs.values()].filter((n) => n >= 1).length;
  const withTwo = [...byWs.values()].filter((n) => n >= 2).length;

  const withPr = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(sql`${tasks.prUrl} is not null`);

  return {
    workspacesWithAcceptedPr: withOne,
    secondAcceptedPrRate: withOne > 0 ? withTwo / withOne : null,
    tasksAccepted: accepted.length,
    tasksWithPr: withPr.length,
  };
}
