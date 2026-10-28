/** Arena / tournament efficiency payoff display helpers (P-140). */

export const DEFAULT_PAYOFF_ALPHA_LABEL = "0.25";

export function formatUsdMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (!Number.isFinite(dollars) || dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

export function reasonLabel(reason: string): string {
  return reason.replace(/_/g, " ");
}

export type PayoffFields = {
  efficiencyScore: number | null;
  fitnessScore: number | null;
  actualCostMicros?: number | null;
  estimatedCostMicros?: number | null;
  fitnessReasons?: string[] | null;
};

export function spendMicros(p: PayoffFields): number {
  const actual = p.actualCostMicros ?? 0;
  if (actual > 0) return actual;
  return p.estimatedCostMicros ?? 0;
}

/** Compact metrics: e · f · spend (+ CI e=0 when applicable). */
export function formatPayoffMetrics(p: PayoffFields): string {
  const e =
    p.efficiencyScore == null ? "—" : p.efficiencyScore.toFixed(3);
  const f = p.fitnessScore == null ? "—" : p.fitnessScore.toFixed(2);
  const spend = formatUsdMicros(spendMicros(p));
  const bits = [`e=${e}`, `f=${f}`, spend];
  if (p.fitnessReasons?.includes("ci_failed")) {
    bits.push("CI failed (e=0)");
  }
  if (p.fitnessReasons?.includes("vibes_only_blocked")) {
    bits.push("vibes blocked");
  }
  return bits.join(" · ");
}

/** Winner promote narrative for resolved tournaments. */
export function formatPromoteReason(
  p: PayoffFields,
  opts?: { alphaLabel?: string },
): string {
  const alpha = opts?.alphaLabel ?? DEFAULT_PAYOFF_ALPHA_LABEL;
  const e =
    p.efficiencyScore == null ? "—" : p.efficiencyScore.toFixed(3);
  const f = p.fitnessScore == null ? "—" : p.fitnessScore.toFixed(2);
  const spend = formatUsdMicros(spendMicros(p));
  const reasons = (p.fitnessReasons ?? [])
    .slice(0, 4)
    .map(reasonLabel)
    .join(", ");
  const base = `Promoted: e=${e} (f=${f} / spend^α, α=${alpha}) · spend ${spend}`;
  if (p.fitnessReasons?.includes("ci_failed")) {
    return `${base} · CI failed (e=0)`;
  }
  return reasons ? `${base} · ${reasons}` : base;
}
