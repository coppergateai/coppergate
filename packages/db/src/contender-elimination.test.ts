import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeFanoutPoolHonesty,
  summarizeArenaContenderPool,
} from "./contender-elimination.js";
import type { Contender } from "./schema.js";

function contender(partial: Partial<Contender> & Pick<Contender, "id">): Contender {
  return {
    arenaId: "arena",
    workspaceId: "ws",
    profileKey: "engineer",
    strategy: "balanced",
    budgetMicrosRemaining: 1_000_000,
    status: "ACTIVE",
    eliminatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("contender elimination (P-141)", () => {
  it("summarizes active vs eliminated pool honestly", () => {
    const summary = summarizeArenaContenderPool([
      contender({ id: "a", budgetMicrosRemaining: 50_000 }),
      contender({ id: "b", status: "ELIMINATED", budgetMicrosRemaining: 0 }),
      contender({ id: "c", status: "ELIMINATED", budgetMicrosRemaining: 0 }),
      contender({ id: "d", budgetMicrosRemaining: 0, status: "ACTIVE" }),
    ]);
    assert.equal(summary.activeWithBudget, 1);
    assert.equal(summary.eliminated, 2);
    assert.equal(summary.activeBroke, 1);
    assert.equal(summary.total, 4);
  });

  it("detects fan-out pool starvation when eligible < requested", () => {
    const honesty = describeFanoutPoolHonesty({
      requestedFanout: 2,
      actualFanout: 1,
      eligibleCount: 1,
      eliminatedInPool: 3,
      concurrencySlots: 4,
      availableMicros: 10_000_000,
      perRunMicros: 100_000,
    });
    assert.equal(honesty.poolStarved, true);
    assert.equal(honesty.poolStarvedReason, "contenders");
    assert.equal(honesty.eliminatedInPool, 3);
  });

  it("attributes starvation to concurrency when slots bind", () => {
    const honesty = describeFanoutPoolHonesty({
      requestedFanout: 2,
      actualFanout: 1,
      eligibleCount: 2,
      eliminatedInPool: 0,
      concurrencySlots: 1,
      availableMicros: 10_000_000,
      perRunMicros: 100_000,
    });
    assert.equal(honesty.poolStarvedReason, "concurrency");
  });
});
