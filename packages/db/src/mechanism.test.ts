import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEfficiencyPayoff,
  DEFAULT_PAYOFF_ALPHA,
  isQualifyingEfficiency,
  MechanismError,
  PAYOFF_ALPHA_PRESETS,
  payoffAlphaFromPreset,
  resolvePayoffAlpha,
  selectWinnerByPayoff,
  SPEND_USD_EPSILON,
  STRATEGY_ACTION_PROFILES,
  strategyActionProfile,
  withStrategyGuidance,
} from "./mechanism.js";

describe("mechanism payoff invariants", () => {
  it("keeps DEFAULT_PAYOFF_ALPHA at 0.25 and exposes presets", () => {
    assert.equal(DEFAULT_PAYOFF_ALPHA, 0.25);
    assert.equal(PAYOFF_ALPHA_PRESETS.default, 0.25);
    assert.equal(PAYOFF_ALPHA_PRESETS.fitness_first, 0);
    assert.equal(PAYOFF_ALPHA_PRESETS.thrift, 0.5);
    assert.equal(payoffAlphaFromPreset("thrift"), 0.5);
    assert.equal(resolvePayoffAlpha(undefined), DEFAULT_PAYOFF_ALPHA);
  });

  it("zeros CI failures", () => {
    assert.equal(
      computeEfficiencyPayoff({
        fitness: 0.9,
        spendMicros: 1_000_000,
        alpha: 0.5,
        ciPassed: false,
      }),
      0,
    );
  });

  it("same f, higher spend ⇒ lower e when α > 0", () => {
    for (const alpha of [0.25, 0.5, 1] as const) {
      const cheap = computeEfficiencyPayoff({
        fitness: 0.8,
        spendMicros: 100_000,
        alpha,
        ciPassed: true,
      });
      const expensive = computeEfficiencyPayoff({
        fitness: 0.8,
        spendMicros: 2_000_000,
        alpha,
        ciPassed: true,
      });
      assert.ok(cheap > expensive, `α=${alpha}`);
    }
  });

  it("α = 0 ⇒ spend irrelevant (pure fitness)", () => {
    const a = computeEfficiencyPayoff({
      fitness: 0.75,
      spendMicros: 100_000,
      alpha: 0,
      ciPassed: true,
    });
    const b = computeEfficiencyPayoff({
      fitness: 0.75,
      spendMicros: 9_000_000,
      alpha: 0,
      ciPassed: true,
    });
    assert.equal(a, b);
    assert.equal(a, 0.75);
  });

  it("spend floor keeps e finite", () => {
    const e = computeEfficiencyPayoff({
      fitness: 1,
      spendMicros: 0,
      alpha: 1,
      ciPassed: true,
    });
    assert.ok(Number.isFinite(e));
    assert.equal(e, 1 / SPEND_USD_EPSILON);
  });

  it("fail-closed: all e≤0 → no_qualifying (no lex lottery)", () => {
    assert.throws(
      () =>
        selectWinnerByPayoff([
          { runId: "aaa", efficiencyScore: 0, fitnessScore: 0 },
          { runId: "zzz", efficiencyScore: 0, fitnessScore: 0.5 },
        ]),
      (err: unknown) =>
        err instanceof MechanismError &&
        err.code === "no_qualifying" &&
        err.message === "no_qualifying_contender",
    );
    assert.equal(isQualifyingEfficiency(0), false);
    assert.equal(isQualifyingEfficiency(0.01), true);
  });

  it("promotes max positive e among mixed field", () => {
    const winner = selectWinnerByPayoff([
      { runId: "dead", efficiencyScore: 0, fitnessScore: 0.9 },
      { runId: "alive", efficiencyScore: 1.2, fitnessScore: 0.6 },
      { runId: "also_dead", efficiencyScore: 0, fitnessScore: 0 },
    ]);
    assert.equal(winner.runId, "alive");
  });
});

describe("strategy action profiles", () => {
  it("exposes spend/verification knobs without critic weight fields", () => {
    for (const key of ["blitz", "fortress", "balanced"] as const) {
      const p = STRATEGY_ACTION_PROFILES[key];
      assert.equal(p.strategy, key);
      assert.ok(p.spendBias > 0 && p.spendBias <= 1);
      assert.ok(p.verificationIntensity > 0 && p.verificationIntensity <= 1);
      assert.match(p.guidance, new RegExp(`Strategy ${key}:`));
      assert.equal(strategyActionProfile(key).spendBias, p.spendBias);
    }
    assert.ok(
      STRATEGY_ACTION_PROFILES.blitz.spendBias <
        STRATEGY_ACTION_PROFILES.balanced.spendBias,
    );
    assert.ok(
      STRATEGY_ACTION_PROFILES.balanced.spendBias <
        STRATEGY_ACTION_PROFILES.fortress.spendBias,
    );
    assert.ok(
      STRATEGY_ACTION_PROFILES.blitz.verificationIntensity <
        STRATEGY_ACTION_PROFILES.fortress.verificationIntensity,
    );
  });

  it("appends strategy guidance once", () => {
    const once = withStrategyGuidance("Ship features.", "blitz");
    assert.match(once, /Strategy blitz:/);
    const twice = withStrategyGuidance(once, "blitz");
    assert.equal(twice, once);
  });
});
