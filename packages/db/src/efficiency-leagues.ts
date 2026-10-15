import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  CONTENDER_STRATEGIES,
  type ContenderStrategy,
} from "./arena.js";
import { agentRuns, auditEvents, contenders } from "./schema.js";

const MIN_SAMPLES = 5;

/**
 * TASK105 — strategy priors from historical wins.
 * Cold start → uniform; requires min sample before weighting.
 */
export async function strategyPriorsForProvider(
  db: Database,
  input: { workspaceId: string; provider: string },
): Promise<Record<ContenderStrategy, number>> {
  const uniform = Object.fromEntries(
    CONTENDER_STRATEGIES.map((s) => [s, 1 / CONTENDER_STRATEGIES.length]),
  ) as Record<ContenderStrategy, number>;

  const winnerRuns = await db
    .select({
      strategy: contenders.strategy,
      count: sql<number>`count(*)::int`,
    })
    .from(agentRuns)
    .innerJoin(contenders, eq(agentRuns.contenderId, contenders.id))
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.tournamentResult, "WINNER"),
      ),
    )
    .groupBy(contenders.strategy);

  const arms = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, input.workspaceId),
        eq(auditEvents.action, "signal.arm"),
      ),
    )
    .limit(200);

  const providerArms = arms.filter((a) => {
    try {
      const meta = a.meta ? JSON.parse(a.meta) : {};
      return meta.provider === input.provider;
    } catch {
      return false;
    }
  });

  if (providerArms.length < MIN_SAMPLES && winnerRuns.length === 0) {
    return uniform;
  }

  const counts: Record<string, number> = {
    balanced: 0,
    blitz: 0,
    fortress: 0,
  };
  let total = 0;
  for (const row of winnerRuns) {
    const s = row.strategy ?? "balanced";
    if (s in counts) {
      counts[s] = (counts[s] ?? 0) + (row.count || 0);
      total += row.count || 0;
    }
  }
  if (total < MIN_SAMPLES) return uniform;

  const priors = { ...uniform };
  for (const s of CONTENDER_STRATEGIES) {
    priors[s] = (counts[s] ?? 0) / total;
  }
  return priors;
}

export function pickStrategiesByPrior(
  priors: Record<ContenderStrategy, number>,
  n: number,
): ContenderStrategy[] {
  const ranked = [...CONTENDER_STRATEGIES].sort(
    (a, b) => (priors[b] ?? 0) - (priors[a] ?? 0),
  );
  const out: ContenderStrategy[] = [];
  for (let i = 0; i < n; i++) {
    out.push(ranked[i % ranked.length]!);
  }
  return out;
}
