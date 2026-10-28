/**
 * AG-030 — Never silent autonomy escalation (PRODUCT §11).
 * Maintainer enable must not raise spend, tools/signals, repos, or prod-adjacent policy.
 */

import type { MaintainerPolicy } from "./maintainer.js";

/** Must stay aligned with DEFAULT_MAINTAINER_POLICY.allowedSignalProviders. */
const DEFAULT_SIGNAL_PROVIDERS_LIST = [
  "*",
  "ci_failure",
  "sentry",
  "dependabot",
  "codeql",
] as const;

export type MaintainerEnableEscalationClamps = {
  /** Workspace cap was already set — enable did not call budget.set_workspace. */
  spendCapUnchanged: boolean;
  /** Policy monthly budget clamped to existing workspace cap. */
  monthlyBudgetClamped: boolean;
  stripped: {
    coordinatedMultiRepo: boolean;
    autoRelease: boolean;
    allowedSignalProviders: boolean;
  };
  effectiveMonthlyBudgetMicros: number;
  existingWorkspaceCapMicros: number | null;
};

const DEFAULT_SIGNAL_PROVIDERS = new Set<string>(DEFAULT_SIGNAL_PROVIDERS_LIST);

/**
 * Pure policy sanitizer for maintainer enable — strips side-door escalations.
 */
export function sanitizePolicyForMaintainerEnable(
  partial: Partial<MaintainerPolicy> | undefined,
  defaults: MaintainerPolicy,
  ctx: { existingWorkspaceCapMicros: number | null },
): { policy: MaintainerPolicy; clamps: MaintainerEnableEscalationClamps } {
  const merged: MaintainerPolicy = {
    ...defaults,
    ...partial,
    enabled: true,
  };

  const stripped = {
    coordinatedMultiRepo: false,
    autoRelease: false,
    allowedSignalProviders: false,
  };

  if (partial?.coordinatedMultiRepo === true) {
    stripped.coordinatedMultiRepo = true;
  }
  merged.coordinatedMultiRepo = false;

  if (partial?.autoRelease === true) {
    stripped.autoRelease = true;
  }
  merged.autoRelease = false;

  const requestedProviders =
    partial?.allowedSignalProviders ?? merged.allowedSignalProviders;
  const clampedProviders = requestedProviders.filter((p) =>
    DEFAULT_SIGNAL_PROVIDERS.has(p),
  );
  if (clampedProviders.length !== requestedProviders.length) {
    stripped.allowedSignalProviders = true;
  }
  merged.allowedSignalProviders =
    clampedProviders.length > 0
      ? clampedProviders
      : [...DEFAULT_SIGNAL_PROVIDERS_LIST];

  let monthlyBudgetClamped = false;
  const requestedBudget = merged.monthlyBudgetMicros;
  if (
    ctx.existingWorkspaceCapMicros !== null &&
    Number.isFinite(ctx.existingWorkspaceCapMicros) &&
    requestedBudget > ctx.existingWorkspaceCapMicros
  ) {
    merged.monthlyBudgetMicros = ctx.existingWorkspaceCapMicros;
    monthlyBudgetClamped = true;
  }

  const spendCapUnchanged = ctx.existingWorkspaceCapMicros !== null;

  return {
    policy: merged,
    clamps: {
      spendCapUnchanged,
      monthlyBudgetClamped,
      stripped,
      effectiveMonthlyBudgetMicros: merged.monthlyBudgetMicros,
      existingWorkspaceCapMicros: ctx.existingWorkspaceCapMicros,
    },
  };
}

/** Whether enable may initialize the workspace envelope (no row yet). */
export function shouldInitWorkspaceBudgetOnEnable(
  existingWorkspaceCapMicros: number | null,
): boolean {
  return existingWorkspaceCapMicros === null;
}
