import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPayoffMetrics,
  formatPromoteReason,
  formatUsdMicros,
  spendMicros,
} from "./payoff-display.js";

describe("payoff-display", () => {
  it("prefers actual spend over estimate", () => {
    assert.equal(
      spendMicros({
        efficiencyScore: 1,
        fitnessScore: 1,
        actualCostMicros: 250_000,
        estimatedCostMicros: 1_000_000,
      }),
      250_000,
    );
  });

  it("falls back to estimate when actual is zero", () => {
    assert.equal(
      spendMicros({
        efficiencyScore: 1,
        fitnessScore: 1,
        actualCostMicros: 0,
        estimatedCostMicros: 500_000,
      }),
      500_000,
    );
  });

  it("formats compact metrics including CI e=0", () => {
    assert.equal(
      formatPayoffMetrics({
        efficiencyScore: 0,
        fitnessScore: 0.4,
        actualCostMicros: 1_000_000,
        fitnessReasons: ["ci_failed"],
      }),
      "e=0.000 · f=0.40 · $1.00 · CI failed (e=0)",
    );
  });

  it("flags vibes-only blocked on metrics", () => {
    assert.match(
      formatPayoffMetrics({
        efficiencyScore: 0,
        fitnessScore: 0,
        actualCostMicros: 0,
        fitnessReasons: ["vibes_only_blocked", "missing_tests"],
      }),
      /vibes blocked/,
    );
  });

  it("formats promote narrative with alpha and reasons", () => {
    const text = formatPromoteReason({
      efficiencyScore: 1.234,
      fitnessScore: 0.8,
      actualCostMicros: 250_000,
      fitnessReasons: ["ci_passed", "meaningful_diff"],
    });
    assert.match(text, /Promoted: e=1\.234/);
    assert.match(text, /α=0\.25/);
    assert.match(text, /\$0\.25/);
    assert.match(text, /ci passed/);
  });

  it("formats tiny USD micros", () => {
    assert.equal(formatUsdMicros(1_000), "$0.0010");
    assert.equal(formatUsdMicros(0), "$0");
  });
});
