/**
 * Contender strategy action profiles — GAME_THEORY.md §5.
 * Shape spawn/spend/prompt behavior only; do NOT alter critic fitness weights.
 * Keep spendBias aligned with `@coppergate/db` STRATEGY_ACTION_PROFILES.
 */

export const CONTENDER_STRATEGIES = ["balanced", "blitz", "fortress"] as const;
export type ContenderStrategy = (typeof CONTENDER_STRATEGIES)[number];

export function isContenderStrategy(value: string): value is ContenderStrategy {
  return (CONTENDER_STRATEGIES as readonly string[]).includes(value);
}

export type StrategyActionProfile = {
  strategy: ContenderStrategy;
  /** Soft spend target as a fraction of spendCapMicros. */
  spendBias: number;
  /** Expected verification intensity (tests / slower path). */
  verificationIntensity: number;
  guidance: string;
};

export const STRATEGY_ACTION_PROFILES: Record<
  ContenderStrategy,
  StrategyActionProfile
> = {
  blitz: {
    strategy: "blitz",
    spendBias: 0.4,
    verificationIntensity: 0.4,
    guidance: [
      "Strategy blitz: ship the thinnest acceptance slice quickly; accept higher failure risk; keep spend lean.",
      "Do not substitute stubs or docs-only placeholders for the feature.",
    ].join(" "),
  },
  fortress: {
    strategy: "fortress",
    spendBias: 0.9,
    verificationIntensity: 1.0,
    guidance: [
      "Strategy fortress: test-heavy path; prefer coverage and e2e before expanding scope; spend for verification.",
    ].join(" "),
  },
  balanced: {
    strategy: "balanced",
    spendBias: 0.7,
    verificationIntensity: 0.7,
    guidance: [
      "Strategy balanced: weigh speed against verification; mid-spend path with evidence-backed changes.",
      "Reject scaffold/typo-only diffs.",
    ].join(" "),
  },
};

export function strategyActionProfile(
  strategy: ContenderStrategy,
): StrategyActionProfile {
  return STRATEGY_ACTION_PROFILES[strategy];
}

/** Soft spend target as a fraction of spendCapMicros. */
export function strategySpendFraction(strategy: ContenderStrategy): number {
  return STRATEGY_ACTION_PROFILES[strategy].spendBias;
}

/** Non-secret guidance appended into agent context. */
export function strategyGuidance(strategy: ContenderStrategy): string {
  return STRATEGY_ACTION_PROFILES[strategy].guidance;
}
