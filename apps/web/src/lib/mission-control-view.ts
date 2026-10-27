import type { WorkspaceMissionControl } from "@coppergate/db";

/** Honest needs-attention total — arena agents omitted during capacity crisis. */
export function missionControlAttentionTotal(
  metrics: WorkspaceMissionControl["metrics"],
  capacityCrisis: boolean,
): number {
  const arena = capacityCrisis ? 0 : metrics.arenaNeedsAttention;
  return metrics.needsApproval + metrics.needsEvidenceAccept + arena;
}

export type MissionControlEmptyContext = {
  capacityCrisis: boolean;
  budgetPaused: boolean;
  hasBudget: boolean;
};

export function missionControlAttentionEmptyBody(
  ctx: MissionControlEmptyContext,
): string {
  if (ctx.budgetPaused) {
    return "Budget envelope is paused — raise the cap under Settings before new work can run.";
  }
  if (ctx.capacityCrisis) {
    return "No inbox or Evidence gates — resolve the capacity or provider quota alert above before chasing Arena noise.";
  }
  return "No approvals, failed arena runs, or blockers. Import an issue from Projects or open Arena when you are ready to queue work.";
}

export function missionControlExecutionsEmptyBody(
  ctx: MissionControlEmptyContext,
): string {
  if (ctx.budgetPaused) {
    return "Executions are frozen while the workspace budget is paused.";
  }
  if (ctx.capacityCrisis) {
    return "Pipeline is idle while capacity or provider quota is blocking new fan-out — clear the crisis row first.";
  }
  if (!ctx.hasBudget) {
    return "Set a workspace budget under Settings → Billing, then open Arena to reserve the next run.";
  }
  return "Nothing in the pipeline right now — import an issue or start Arena on a bound project.";
}
