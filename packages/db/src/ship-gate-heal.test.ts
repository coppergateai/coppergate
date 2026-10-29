import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHIP_GATE_HEAL_MARKER,
  STALE_REVIEW_AFTER_CI_TIMEOUT_MS,
  buildShipGateHealTitle,
  isShipGateHealTitle,
  openTaskCountsAsBusyForBacklog,
  shipGateMergeMode,
  shouldRequestChangesForStaleCiTimeoutReview,
} from "./ship-gate-heal-policy.js";

describe("ship-gate-heal (AG-031)", () => {
  it("detects [ship-gate] titles", () => {
    assert.equal(isShipGateHealTitle(buildShipGateHealTitle("ff6f41e6abcd")), true);
    assert.equal(
      isShipGateHealTitle(`${SHIP_GATE_HEAL_MARKER} Fix default-branch CI`),
      true,
    );
    assert.equal(isShipGateHealTitle("AG-018: Contender N pin"), false);
    assert.equal(isShipGateHealTitle(null), false);
  });

  it("AG-034: tip red allows heal-only merge; pending/rollback halt", () => {
    assert.equal(
      shipGateMergeMode({ tipKind: "green", openRollbacks: 0 }),
      "all",
    );
    assert.equal(
      shipGateMergeMode({ tipKind: "red", openRollbacks: 0 }),
      "heal_only",
    );
    assert.equal(
      shipGateMergeMode({ tipKind: "pending", openRollbacks: 0 }),
      "halt",
    );
    assert.equal(
      shipGateMergeMode({ tipKind: "red", openRollbacks: 1 }),
      "halt",
    );
    assert.equal(
      shipGateMergeMode({ tipKind: "green", openRollbacks: 1 }),
      "halt",
    );
  });

  it("builds title with short sha", () => {
    const title = buildShipGateHealTitle("ff6f41e6abcdef");
    assert.match(title, /\[ship-gate\]/i);
    assert.match(title, /ff6f41e6/);
    assert.ok(!title.includes("abcdef"));
  });

  it("excludes stale CI-timeout REVIEW from busy backlog count", () => {
    assert.equal(
      openTaskCountsAsBusyForBacklog({
        status: "REVIEW_REQUIRED",
        hasWaitingCiTimeout: true,
        acceptReady: false,
      }),
      false,
    );
    assert.equal(
      openTaskCountsAsBusyForBacklog({
        status: "REVIEW_REQUIRED",
        hasWaitingCiTimeout: true,
        acceptReady: true,
      }),
      true,
    );
    assert.equal(
      openTaskCountsAsBusyForBacklog({
        status: "REVIEW_REQUIRED",
        hasWaitingCiTimeout: false,
        acceptReady: false,
      }),
      true,
    );
    assert.equal(
      openTaskCountsAsBusyForBacklog({
        status: "QUEUED",
        hasWaitingCiTimeout: true,
        acceptReady: false,
      }),
      true,
    );
  });

  it("requests changes only after stale grace on CI-timeout review", () => {
    const now = Date.UTC(2026, 9, 29, 8, 20);
    const fresh = new Date(now - 5 * 60_000);
    const stale = new Date(now - STALE_REVIEW_AFTER_CI_TIMEOUT_MS - 1);
    assert.equal(
      shouldRequestChangesForStaleCiTimeoutReview({
        taskStatus: "REVIEW_REQUIRED",
        acceptReady: false,
        hasWaitingCiTimeout: true,
        taskUpdatedAt: fresh,
        nowMs: now,
      }),
      false,
    );
    assert.equal(
      shouldRequestChangesForStaleCiTimeoutReview({
        taskStatus: "REVIEW_REQUIRED",
        acceptReady: false,
        hasWaitingCiTimeout: true,
        taskUpdatedAt: stale,
        nowMs: now,
      }),
      true,
    );
    assert.equal(
      shouldRequestChangesForStaleCiTimeoutReview({
        taskStatus: "REVIEW_REQUIRED",
        acceptReady: true,
        hasWaitingCiTimeout: true,
        taskUpdatedAt: stale,
        nowMs: now,
      }),
      false,
    );
  });
});
