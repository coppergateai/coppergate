/**
 * Game-theory mechanism constitution (pure).
 * All-pay efficiency contest: e = f / spend^α; promote only when max(e) > 0.
 * @see coppergate-architecture/docs/GAME_THEORY.md
 */

export const DEFAULT_PAYOFF_ALPHA = 0.25;

/** Floor spend (USD) so efficiency stays finite. */
export const SPEND_USD_EPSILON = 1e-6;

/**
 * Operator α presets — mechanism parameter, not critic weights.
 * fitness_first (0): spend ignored; default (0.25): mild thrift; thrift (0.5): stronger spend penalty.
 */
export const PAYOFF_ALPHA_PRESETS = {
  fitness_first: 0,
  default: DEFAULT_PAYOFF_ALPHA,
  thrift: 0.5,
} as const;

export type PayoffAlphaPreset = keyof typeof PAYOFF_ALPHA_PRESETS;

export const CONTENDER_STRATEGIES = ["balanced", "blitz", "fortress"] as const;
export type ContenderStrategy = (typeof CONTENDER_STRATEGIES)[number];

export function isContenderStrategy(value: string): value is ContenderStrategy {
  return (CONTENDER_STRATEGIES as readonly string[]).includes(value);
}

/**
 * Mixed-strategy action profiles — shape spawn/behavior expectations.
 * Do NOT feed these into critic fitness weights (avoids critic gaming).
 */
export type StrategyActionProfile = {
  strategy: ContenderStrategy;
  /** Relative spend appetite: <1 thriftier, >1 burn-tolerant. */
  spendBias: number;
  /** Expected verification intensity: higher ⇒ more tests / slower path. */
  verificationIntensity: number;
  /** Prompt / spawn guidance for the contender harness. */
  guidance: string;
};

/**
 * Action profiles (not critic weights). spendBias = soft fraction of spendCap.
 * Keep aligned with `@coppergate/agents` strategySpendFraction.
 */
export const STRATEGY_ACTION_PROFILES: Record<
  ContenderStrategy,
  StrategyActionProfile
> = {
  blitz: {
    strategy: "blitz",
    spendBias: 0.4,
    verificationIntensity: 0.4,
    guidance:
      "Strategy blitz: ship the thinnest acceptance slice quickly; accept higher failure risk; keep spend lean. Do not substitute stubs or docs-only placeholders for the feature.",
  },
  fortress: {
    strategy: "fortress",
    spendBias: 0.9,
    verificationIntensity: 1.0,
    guidance:
      "Strategy fortress: test-heavy path; prefer coverage and e2e before expanding scope; spend for verification.",
  },
  balanced: {
    strategy: "balanced",
    spendBias: 0.7,
    verificationIntensity: 0.7,
    guidance:
      "Strategy balanced: weigh speed against verification; mid-spend path with evidence-backed changes. Reject scaffold/typo-only diffs.",
  },
};

export function strategyActionProfile(
  strategy: string | null | undefined,
): StrategyActionProfile {
  const key =
    strategy && isContenderStrategy(strategy) ? strategy : "balanced";
  return STRATEGY_ACTION_PROFILES[key];
}

/** Append strategy action-profile blurb without duplicating. */
export function withStrategyGuidance(
  promptGuidance: string,
  strategy: string | null | undefined,
): string {
  const profile = strategyActionProfile(strategy);
  const base = promptGuidance.trim();
  if (!base) return profile.guidance;
  if (base.includes("Strategy blitz:") || base.includes("Strategy fortress:") || base.includes("Strategy balanced:")) {
    return base;
  }
  return `${base}\n\n${profile.guidance}`;
}

export function resolvePayoffAlpha(
  alpha: number | null | undefined,
): number {
  if (alpha != null && Number.isFinite(alpha) && alpha >= 0) {
    return alpha;
  }
  return DEFAULT_PAYOFF_ALPHA;
}

export function payoffAlphaFromPreset(
  preset: PayoffAlphaPreset | string,
): number {
  if (preset in PAYOFF_ALPHA_PRESETS) {
    return PAYOFF_ALPHA_PRESETS[preset as PayoffAlphaPreset];
  }
  throw new MechanismError("invalid", `unknown payoff alpha preset: ${preset}`);
}

export class MechanismError extends Error {
  readonly code: "invalid" | "no_qualifying";

  constructor(code: MechanismError["code"], message: string) {
    super(message);
    this.name = "MechanismError";
    this.code = code;
  }
}

/**
 * Mechanism payoff: e = f / spend_usd^α.
 * Hard gate: CI fail ⇒ 0 (token race cannot buy a green check).
 */
export function computeEfficiencyPayoff(input: {
  fitness: number;
  spendMicros: number;
  alpha?: number;
  ciPassed?: boolean | null;
}): number {
  if (input.ciPassed === false) return 0;
  const fitness = input.fitness;
  if (!Number.isFinite(fitness) || fitness < 0) return 0;
  const alpha = resolvePayoffAlpha(input.alpha);
  const spendUsd = Math.max(input.spendMicros / 1_000_000, SPEND_USD_EPSILON);
  const payoff = fitness / spendUsd ** alpha;
  return Number.isFinite(payoff) ? payoff : 0;
}

/** True when efficiency is a finite positive score (qualifies for promote). */
export function isQualifyingEfficiency(
  efficiencyScore: number | null | undefined,
): boolean {
  return (
    efficiencyScore != null &&
    Number.isFinite(efficiencyScore) &&
    efficiencyScore > 0
  );
}

export type PayoffCandidate = {
  runId: string;
  efficiencyScore: number | null;
  fitnessScore: number | null;
};

/**
 * Pure: highest efficiency wins; ties → higher fitness → lex runId.
 * Fail-closed: if no candidate has e > 0, throws MechanismError("no_qualifying").
 * Selection requires positive efficiency evidence — no lex-UUID lottery.
 */
export function selectWinnerByPayoff(
  candidates: PayoffCandidate[],
): PayoffCandidate {
  if (candidates.length === 0) {
    throw new MechanismError("invalid", "tournament has no candidates");
  }
  const scored = candidates.filter(
    (c) => c.efficiencyScore != null && Number.isFinite(c.efficiencyScore),
  );
  if (scored.length === 0) {
    throw new MechanismError("invalid", "no scored candidates");
  }
  const qualifying = scored.filter((c) =>
    isQualifyingEfficiency(c.efficiencyScore),
  );
  if (qualifying.length === 0) {
    throw new MechanismError(
      "no_qualifying",
      "no_qualifying_contender",
    );
  }
  return [...qualifying].sort((a, b) => {
    const eDiff =
      (b.efficiencyScore as number) - (a.efficiencyScore as number);
    if (eDiff !== 0) return eDiff;
    const fA =
      a.fitnessScore != null && Number.isFinite(a.fitnessScore)
        ? a.fitnessScore
        : -1;
    const fB =
      b.fitnessScore != null && Number.isFinite(b.fitnessScore)
        ? b.fitnessScore
        : -1;
    if (fB !== fA) return fB - fA;
    return a.runId.localeCompare(b.runId);
  })[0]!;
}
