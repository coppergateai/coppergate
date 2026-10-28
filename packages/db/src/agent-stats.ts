import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { agentRuns } from "./schema.js";

export type AgentProfileStats = {
  profileKey: string;
  runCount: number;
  failedCount: number;
  winCount: number;
  loseCount: number;
  spendMicros: number;
  lastRunAt: string | null;
};

/** Workspace rollup of agent_runs by profile key (default 30d). */
export async function getWorkspaceAgentProfileStats(
  db: Database,
  input: { workspaceId: string; days?: number },
): Promise<AgentProfileStats[]> {
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      profileKey: agentRuns.agentProfileKey,
      runCount: sql<number>`count(*)::int`,
      failedCount: sql<number>`count(*) filter (where ${agentRuns.status} = 'FAILED')::int`,
      winCount: sql<number>`count(*) filter (where ${agentRuns.tournamentResult} = 'WINNER')::int`,
      loseCount: sql<number>`count(*) filter (where ${agentRuns.tournamentResult} = 'LOSER')::int`,
      spendMicros: sql<number>`coalesce(sum(${agentRuns.actualCostMicros}), 0)::bigint`,
      lastRunAt: sql<string | null>`max(${agentRuns.createdAt})`,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        gte(agentRuns.createdAt, since),
      ),
    )
    .groupBy(agentRuns.agentProfileKey);

  return rows.map((r) => ({
    profileKey: r.profileKey,
    runCount: Number(r.runCount ?? 0),
    failedCount: Number(r.failedCount ?? 0),
    winCount: Number(r.winCount ?? 0),
    loseCount: Number(r.loseCount ?? 0),
    spendMicros: Number(r.spendMicros ?? 0),
    lastRunAt:
      r.lastRunAt == null
        ? null
        : typeof r.lastRunAt === "string"
          ? r.lastRunAt
          : new Date(r.lastRunAt as unknown as string).toISOString(),
  }));
}
