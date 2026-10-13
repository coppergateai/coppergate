import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { agentRuns, tasks, usageEvents } from "./schema.js";

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
