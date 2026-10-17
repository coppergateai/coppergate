/**
 * Re-export plan limits from @coppergate/db (single source of truth).
 * Billing package keeps the public SKU surface; enforcement lives in db.
 */
export {
  PLAN_LIMITS,
  PlanLimitError,
  assertPlanConcurrency,
  clampTournamentFanout,
  limitsForPlan,
  resolveWorkspacePlanLimits,
  type PlanLimits,
} from "@coppergate/db";
