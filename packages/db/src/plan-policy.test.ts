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
  it("Starter is stricter than Pro on concurrency; both solo fan-out", () => {
    const starter = limitsForPlan("starter");
    const pro = limitsForPlan("pro");
    assert.ok(starter.maxConcurrentRuns < pro.maxConcurrentRuns);
    assert.equal(starter.maxTournamentFanout, 1);
    assert.equal(pro.maxTournamentFanout, 1);
    assert.equal(starter.previewEnabled, false);
    assert.equal(pro.previewEnabled, true);
  });

  it("Starter / Community / Pro solo fan-out under BYOK throttle", () => {
    assert.equal(clampTournamentFanout(3, "starter"), 1);
    assert.equal(clampTournamentFanout(11, "community"), 1);
    assert.equal(clampTournamentFanout(11, "pro"), 1);
    assert.equal(clampTournamentFanout(99, "team"), 11);
    assert.equal(PLAN_LIMITS.starter.maxConcurrentRuns, 1);
  });

  it("Community and Pro share the BYOK-throttled concurrency cap", () => {
    assert.equal(PLAN_LIMITS.community.maxConcurrentRuns, 6);
    assert.equal(PLAN_LIMITS.pro.maxConcurrentRuns, 6);
    assert.equal(PLAN_LIMITS.community.maxConcurrentRunsPerProject, 1);
    assert.equal(PLAN_LIMITS.pro.maxConcurrentRunsPerProject, 1);
    assert.equal(PLAN_LIMITS.community.maxTournamentFanout, 1);
    assert.equal(PLAN_LIMITS.pro.maxTournamentFanout, 1);
  });

  it("remainingConcurrencySlots never goes negative", () => {
    assert.equal(remainingConcurrencySlots(0, 6), 6);
    assert.equal(remainingConcurrencySlots(6, 6), 0);
    assert.equal(remainingConcurrencySlots(10, 6), 0);
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
        concurrencySlots: 6,
        availableMicros: 5_000_000,
        perRunMicros: 2_000_000,
      }),
      2,
    );
    assert.equal(
      clampFanoutToCapacity({
        requested: 11,
        concurrencySlots: 6,
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
