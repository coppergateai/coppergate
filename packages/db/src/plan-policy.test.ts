import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_LIMITS,
  clampFanoutToCapacity,
  clampTournamentFanout,
  limitsForPlan,
  remainingConcurrencySlots,
} from "./plan-policy.js";

describe("plan policy", () => {
  it("Starter is stricter than Pro on concurrency and fanout", () => {
    const starter = limitsForPlan("starter");
    const pro = limitsForPlan("pro");
    assert.ok(starter.maxConcurrentRuns < pro.maxConcurrentRuns);
    assert.ok(starter.maxTournamentFanout < pro.maxTournamentFanout);
    assert.equal(starter.previewEnabled, false);
    assert.equal(pro.previewEnabled, true);
  });

  it("Starter clamps fan-out; Community/Pro keep arena width", () => {
    assert.equal(clampTournamentFanout(3, "starter"), 1);
    assert.equal(clampTournamentFanout(11, "community"), 11);
    assert.equal(clampTournamentFanout(11, "pro"), 11);
    assert.equal(clampTournamentFanout(99, "community"), 11);
    assert.equal(PLAN_LIMITS.starter.maxConcurrentRuns, 1);
  });

  it("Community and Pro share the raised concurrency cap", () => {
    assert.equal(PLAN_LIMITS.community.maxConcurrentRuns, 20);
    assert.equal(PLAN_LIMITS.pro.maxConcurrentRuns, 20);
  });

  it("remainingConcurrencySlots never goes negative", () => {
    assert.equal(remainingConcurrencySlots(0, 20), 20);
    assert.equal(remainingConcurrencySlots(20, 20), 0);
    assert.equal(remainingConcurrencySlots(25, 20), 0);
  });

  it("clampFanoutToCapacity respects slots and available budget", () => {
    assert.equal(
      clampFanoutToCapacity({
        requested: 11,
        concurrencySlots: 3,
        availableMicros: 100_000_000,
        perRunMicros: 2_000_000,
      }),
      3,
    );
    assert.equal(
      clampFanoutToCapacity({
        requested: 11,
        concurrencySlots: 20,
        availableMicros: 5_000_000,
        perRunMicros: 2_000_000,
      }),
      2,
    );
    assert.equal(
      clampFanoutToCapacity({
        requested: 11,
        concurrencySlots: 20,
        availableMicros: 1_000_000,
        perRunMicros: 2_000_000,
      }),
      0,
    );
    assert.equal(
      clampFanoutToCapacity({
        requested: 5,
        concurrencySlots: 5,
        availableMicros: 10_000_000,
        perRunMicros: 0,
      }),
      5,
    );
  });
});
