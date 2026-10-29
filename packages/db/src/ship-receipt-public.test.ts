import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPublicShipReceipt } from "./ship-receipt-public.js";

describe("ship-receipt-public (P-106)", () => {
  it("toPublicShipReceipt omits acceptedBy and keeps Open Program fields", () => {
    const receipt = {
      openId: "P-106",
      title: "P-106: Ship Receipt share polish",
      spendMicros: 1_250_000,
      fitnessScore: 0.91,
      efficiencyScore: 0.8,
      ci: {
        acceptReady: true,
        blocking: false,
        passed: true,
        checkCount: 3,
      },
      writeback: {
        architectureId: "P-106",
        note: "Open Program P-106 → Done on Accept",
      },
      acceptedAt: "2026-10-29T00:00:00.000Z",
      acceptedBy: "user@example.com",
    };
    const pub = toPublicShipReceipt(receipt);
    assert.equal(pub.kind, "shared_ship_receipt");
    assert.equal(pub.openId, "P-106");
    assert.equal(pub.spendLabel, "$1.25");
    assert.equal(pub.fitnessScore, 0.91);
    assert.equal(pub.ci.passed, true);
    assert.equal(pub.writeback.architectureId, "P-106");
    assert.equal(
      Object.prototype.hasOwnProperty.call(pub, "acceptedBy"),
      false,
    );
  });
});
