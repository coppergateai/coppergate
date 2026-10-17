import type { BillingPlan } from "./schema.js";
import type { Database } from "./client.js";
import { effectivePlan, getWorkspaceSubscription } from "./billing.js";
import { countInflightRunsForWorkspace } from "./runs.js";

export type PlanLimits = {
  maxConcurrentRuns: number;
  maxTournamentFanout: number;
  previewEnabled: boolean;
  arenaEnabled: boolean;
};

export const PLAN_LIMITS: Record<BillingPlan, PlanLimits> = {
  /** Self-host / unpaid — generous local arena; no hosted preview. */
  community: {
    maxConcurrentRuns: 4,
    maxTournamentFanout: 3,
    previewEnabled: false,
    arenaEnabled: true,
  },
  /** Hosted Starter — modest concurrency (SKU promise). */
  starter: {
    maxConcurrentRuns: 1,
    maxTournamentFanout: 1,
    previewEnabled: false,
    arenaEnabled: false,
  },
  pro: {
    maxConcurrentRuns: 4,
    maxTournamentFanout: 3,
    previewEnabled: true,
    arenaEnabled: true,
  },
  team: {
    maxConcurrentRuns: 8,
    maxTournamentFanout: 3,
    previewEnabled: true,
    arenaEnabled: true,
  },
};

export function limitsForPlan(plan: BillingPlan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.community;
}

export class PlanLimitError extends Error {
  readonly code = "plan_limit" as const;
  constructor(
    readonly limit: keyof PlanLimits,
    readonly plan: BillingPlan,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function resolveWorkspacePlanLimits(
  db: Database,
  workspaceId: string,
): Promise<{ plan: BillingPlan; limits: PlanLimits }> {
  const sub = await getWorkspaceSubscription(db, workspaceId);
  const plan = effectivePlan(sub);
  return { plan, limits: limitsForPlan(plan) };
}

/** Fail closed when workspace is at concurrency cap. */
export async function assertPlanConcurrency(
  db: Database,
  workspaceId: string,
): Promise<{ plan: BillingPlan; limits: PlanLimits; inflight: number }> {
  const { plan, limits } = await resolveWorkspacePlanLimits(db, workspaceId);
  const inflight = await countInflightRunsForWorkspace(db, workspaceId);
  if (inflight >= limits.maxConcurrentRuns) {
    throw new PlanLimitError(
      "maxConcurrentRuns",
      plan,
      `${plan} plan allows ${limits.maxConcurrentRuns} concurrent run(s); ${inflight} in flight — upgrade or wait`,
    );
  }
  return { plan, limits, inflight };
}

/** Clamp tournament width to plan. */
export function clampTournamentFanout(
  requested: number,
  plan: BillingPlan,
): number {
  const max = limitsForPlan(plan).maxTournamentFanout;
  return Math.max(1, Math.min(requested, max));
}
