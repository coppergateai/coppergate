import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAINTAINER_POLICY,
  DEFAULT_MONTHLY_BUDGET_MICROS,
  parseMaintainerPolicy,
  serializeMaintainerPolicy,
} from "./maintainer.js";
import { shouldRollMonthlyPeriod } from "./budgets.js";

describe("maintainer policy", () => {
  it("parses defaults when raw is null", () => {
    const p = parseMaintainerPolicy(null);
    assert.equal(p.enabled, false);
    assert.equal(p.monthlyBudgetMicros, DEFAULT_MONTHLY_BUDGET_MICROS);
    assert.equal(p.autoMerge, true);
  });

  it("merges partial JSON", () => {
    const p = parseMaintainerPolicy(
      JSON.stringify({
        enabled: true,
        monthlyBudgetMicros: 5_000_000,
        maxTournamentN: 9,
      }),
    );
    assert.equal(p.enabled, true);
    assert.equal(p.monthlyBudgetMicros, 5_000_000);
    assert.equal(p.maxTournamentN, 3);
    assert.equal(p.selfImprove, DEFAULT_MAINTAINER_POLICY.selfImprove);
  });

  it("round-trips serialize", () => {
    const raw = serializeMaintainerPolicy({
      ...DEFAULT_MAINTAINER_POLICY,
      enabled: true,
      monthlyBudgetMicros: 5_000_000,
    });
    const p = parseMaintainerPolicy(raw);
    assert.equal(p.enabled, true);
    assert.equal(p.monthlyBudgetMicros, 5_000_000);
  });
});

describe("monthly budget period", () => {
  it("rolls when period missing", () => {
    assert.equal(shouldRollMonthlyPeriod(null), true);
  });

  it("rolls after 30 days", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    assert.equal(shouldRollMonthlyPeriod(old), true);
  });

  it("does not roll within same month window", () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    assert.equal(shouldRollMonthlyPeriod(recent), false);
  });
});
