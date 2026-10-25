import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildShipReceipt } from "./ship-receipt.js";

describe("ship-receipt", () => {
  it("buildShipReceipt captures Open ID and spend", () => {
    const receipt = buildShipReceipt({
      task: {
        id: "task-1",
        title: "AG-011: WAITING_CI / lease honesty under Pause",
        prUrl: "https://github.com/coppergateai/coppergate/pull/3",
      },
      run: {
        id: "run-1",
        actualCostMicros: 420_000,
        fitnessScore: 0.91,
        efficiencyScore: 0.4,
        agentProfileKey: "engineer",
        prUrl: "https://github.com/coppergateai/coppergate/pull/3",
        prNumber: 3,
      },
      ci: {
        acceptReady: true,
        blocking: false,
        passed: true,
        checkCount: 2,
      },
      humanTouches: 1,
      acceptedBy: "user-1",
      acceptedAt: new Date("2026-10-25T12:00:00.000Z"),
    });

    assert.equal(receipt.kind, "ship_receipt");
    assert.equal(receipt.openId, "AG-011");
    assert.equal(receipt.spendMicros, 420_000);
    assert.equal(receipt.winnerProfileKey, "engineer");
    assert.equal(receipt.humanTouches, 1);
    assert.equal(receipt.writeback.architectureId, "AG-011");
    assert.match(receipt.writeback.note, /Done on Accept/);
  });

  it("buildShipReceipt allows null Open ID with skip note", () => {
    const receipt = buildShipReceipt({
      task: { id: "t2", title: "ad-hoc fix", prUrl: null },
      run: null,
      ci: {
        acceptReady: true,
        blocking: false,
        passed: false,
        checkCount: 0,
      },
      humanTouches: 1,
      acceptedBy: "user-1",
    });
    assert.equal(receipt.openId, null);
    assert.match(receipt.writeback.note, /writeback skipped/);
  });
});
