import type { BillingPlan } from "./schema.js";
import type { Database } from "./client.js";
import { effectivePlan, getWorkspaceSubscription } from "./billing.js";
import {
  countInflightRunsForProject,
  countInflightRunsForWorkspace,
} from "./runs.js";

export type PlanLimits = {
  maxConcurrentRuns: number;
  /** Soft cap so one project cannot consume the whole workspace envelope. */
  maxConcurrentRunsPerProject: number;
  maxTournamentFanout: number;
  previewEnabled: boolean;
  arenaEnabled: boolean;
};

export const PLAN_LIMITS: Record<BillingPlan, PlanLimits> = {
  /**
   * Self-host / unpaid — arena on, but capped for typical BYOK org spend
   * limits (~$10/mo OpenAI hobby). Prefer solo fan-out over tournaments.
   */
  community: {
    maxConcurrentRuns: 6,
    maxConcurrentRunsPerProject: 1,
    maxTournamentFanout: 1,
    previewEnabled: false,
    arenaEnabled: true,
  },
  /** Hosted Starter — modest concurrency (SKU promise). */
  starter: {
    maxConcurrentRuns: 1,
    maxConcurrentRunsPerProject: 1,
    maxTournamentFanout: 1,
    previewEnabled: false,
    arenaEnabled: false,
  },
  pro: {
    maxConcurrentRuns: 6,
    maxConcurrentRunsPerProject: 1,
    maxTournamentFanout: 1,
    previewEnabled: true,
    arenaEnabled: true,
  },
  team: {
    maxConcurrentRuns: 16,
    maxConcurrentRunsPerProject: 4,
    maxTournamentFanout: 11,
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

/** Fail closed when workspace (and optional project) is at concurrency cap. */
export async function assertPlanConcurrency(
  db: Database,
  workspaceId: string,
  projectId?: string,
): Promise<{
  plan: BillingPlan;
  limits: PlanLimits;
  inflight: number;
  projectInflight: number;
}> {
  const { plan, limits } = await resolveWorkspacePlanLimits(db, workspaceId);
  const inflight = await countInflightRunsForWorkspace(db, workspaceId);
  if (inflight >= limits.maxConcurrentRuns) {
    throw new PlanLimitError(
      "maxConcurrentRuns",
      plan,
      `${plan} plan allows ${limits.maxConcurrentRuns} concurrent run(s); ${inflight} in flight — upgrade or wait`,
    );
  }
  let projectInflight = 0;
  if (projectId) {
    projectInflight = await countInflightRunsForProject(
      db,
      workspaceId,
      projectId,
    );
    if (projectInflight >= limits.maxConcurrentRunsPerProject) {
      throw new PlanLimitError(
        "maxConcurrentRunsPerProject",
        plan,
        `${plan} plan allows ${limits.maxConcurrentRunsPerProject} concurrent run(s) per project; ${projectInflight} in flight on this project — wait or pause Arena`,
      );
    }
  }
  return { plan, limits, inflight, projectInflight };
}

/** Clamp tournament width to plan. */
export function clampTournamentFanout(
  requested: number,
  plan: BillingPlan,
): number {
  const max = limitsForPlan(plan).maxTournamentFanout;
  return Math.max(1, Math.min(requested, max));
}

/** How many new runs can start given current inflight and plan cap. */
export function remainingConcurrencySlots(
  inflight: number,
  maxConcurrentRuns: number,
): number {
  return Math.max(0, maxConcurrentRuns - Math.max(0, inflight));
}

/**
 * Cap fan-out by concurrency slots and affordable estimate units.
 * Returns 0 when nothing can be started.
 */
export function clampFanoutToCapacity(input: {
  requested: number;
  concurrencySlots: number;
  availableMicros: number;
  perRunMicros: number;
}): number {
  const requested = Math.max(0, Math.floor(input.requested));
  if (requested < 1) return 0;
  const bySlots = Math.min(requested, input.concurrencySlots);
  if (bySlots < 1) return 0;
  if (input.perRunMicros <= 0) return bySlots;
  const affordable = Math.floor(
    Math.max(0, input.availableMicros) / input.perRunMicros,
  );
  return Math.min(bySlots, Math.max(0, affordable));
}

export async function getWorkspaceConcurrency(
  db: Database,
  workspaceId: string,
  projectId?: string,
): Promise<{
  plan: BillingPlan;
  limits: PlanLimits;
  inflight: number;
  projectInflight: number;
  slots: number;
}> {
  const { plan, limits } = await resolveWorkspacePlanLimits(db, workspaceId);
  const inflight = await countInflightRunsForWorkspace(db, workspaceId);
  const projectInflight = projectId
    ? await countInflightRunsForProject(db, workspaceId, projectId)
    : 0;
  const workspaceSlots = remainingConcurrencySlots(
    inflight,
    limits.maxConcurrentRuns,
  );
  const projectSlots = projectId
    ? remainingConcurrencySlots(
        projectInflight,
        limits.maxConcurrentRunsPerProject,
      )
    : workspaceSlots;
  return {
    plan,
    limits,
    inflight,
    projectInflight,
    slots: Math.min(workspaceSlots, projectSlots),
  };
}
