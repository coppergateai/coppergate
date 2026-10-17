import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_LIMITS,
  clampTournamentFanout,
  limitsForPlan,
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
    assert.equal(clampTournamentFanout(3, "community"), 3);
    assert.equal(clampTournamentFanout(3, "pro"), 3);
    assert.equal(PLAN_LIMITS.starter.maxConcurrentRuns, 1);
  });
});
