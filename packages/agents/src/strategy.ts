/**
 * Contender strategy knobs — GAME_THEORY.md §5 / TASK058.
 */

export const CONTENDER_STRATEGIES = ["balanced", "blitz", "fortress"] as const;
export type ContenderStrategy = (typeof CONTENDER_STRATEGIES)[number];

export function isContenderStrategy(value: string): value is ContenderStrategy {
  return (CONTENDER_STRATEGIES as readonly string[]).includes(value);
}

/** Soft spend target as a fraction of spendCapMicros. */
export function strategySpendFraction(strategy: ContenderStrategy): number {
  switch (strategy) {
    case "blitz":
      return 0.4;
    case "fortress":
      return 0.9;
    case "balanced":
    default:
      return 0.7;
  }
}

/** Non-secret guidance appended into agent context. */
export function strategyGuidance(strategy: ContenderStrategy): string {
  switch (strategy) {
    case "blitz":
      return [
        "Strategy: blitz.",
        "Prioritize speed and low spend.",
        "Ship a minimal correct change; avoid broad refactors and optional polish.",
      ].join(" ");
    case "fortress":
      return [
        "Strategy: fortress.",
        "Prioritize tests, validation, and defensive correctness.",
        "Prefer thorough coverage even if spend is higher.",
      ].join(" ");
    case "balanced":
    default:
      return [
        "Strategy: balanced.",
        "Trade speed and thoroughness evenly under the spend cap.",
      ].join(" ");
  }
}
