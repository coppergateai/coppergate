import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  missionControlAttentionEmptyBody,
  missionControlAttentionTotal,
  missionControlExecutionsEmptyBody,
} from "./mission-control-view.js";

describe("mission-control-view (P-101)", () => {
  const metrics = {
    activeRuns: 0,
    activeRunProjects: 0,
    needsApproval: 2,
    needsEvidenceAccept: 1,
    highPriorityApprovals: 0,
    verifiedPrsThisMonth: 0,
    budgetSpentMicros: 0,
    budgetReservedMicros: 0,
    budgetAvailableMicros: 0,
    budgetCapMicros: 8_000_000,
    budgetCurrency: "USD",
    budgetStatus: null,
    arenaRunning: 1,
    arenaAwaitingCi: 0,
    arenaNeedsAttention: 4,
    arenaIdle: 0,
  };

  it("missionControlAttentionTotal drops arena count during capacity crisis", () => {
    assert.equal(missionControlAttentionTotal(metrics, false), 7);
    assert.equal(missionControlAttentionTotal(metrics, true), 3);
  });

  it("empty bodies reflect crisis and budget honestly", () => {
    assert.match(
      missionControlAttentionEmptyBody({
        capacityCrisis: true,
        budgetPaused: false,
        hasBudget: true,
      }),
      /quota/i,
    );
    assert.match(
      missionControlExecutionsEmptyBody({
        capacityCrisis: false,
        budgetPaused: true,
        hasBudget: true,
      }),
      /frozen/i,
    );
    assert.match(
      missionControlExecutionsEmptyBody({
        capacityCrisis: false,
        budgetPaused: false,
        hasBudget: false,
      }),
      /budget/i,
    );
  });
});
