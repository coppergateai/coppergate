import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateFlakeRetryDeferral,
  FLAKE_RETRY_COOLDOWN_MS,
  flakeRetryBlockedMessage,
} from "./flake-retry-cooldown.js";
import type { CiCheckHistoryEntry } from "./ci-waiting-honesty.js";

function hist(
  rows: Array<{
    name: string;
    conclusion: string;
    atMs: number;
    passed?: boolean;
  }>,
): CiCheckHistoryEntry[] {
  return rows.map((r) => ({
    name: r.name,
    conclusion: r.conclusion,
    passed: r.passed ?? r.conclusion === "success",
    at: new Date(r.atMs),
  }));
}

describe("evaluateFlakeRetryDeferral (AG-021)", () => {
  it("allows retry when CI history is not flaky", () => {
    const now = 1_000_000;
    const out = evaluateFlakeRetryDeferral({
      checkHistory: hist([
        { name: "check", conclusion: "failure", atMs: now - 10_000 },
      ]),
      lastRetryOrHealAt: new Date(now - 60_000),
      nowMs: now,
    });
    assert.equal(out.flaky, false);
    assert.equal(out.defer, false);
  });

  it("defers when flake pattern and recent retry audit", () => {
    const now = 2_000_000;
    const out = evaluateFlakeRetryDeferral({
      checkHistory: hist([
        { name: "check", conclusion: "failure", atMs: now - 120_000 },
        { name: "check", conclusion: "success", atMs: now - 30_000 },
      ]),
      lastRetryOrHealAt: new Date(now - 5 * 60_000),
      nowMs: now,
    });
    assert.equal(out.flaky, true);
    assert.equal(out.defer, true);
    assert.ok(out.retryAfterMs != null && out.retryAfterMs > 0);
  });

  it("allows retry after cooldown elapses", () => {
    const now = 3_000_000;
    const out = evaluateFlakeRetryDeferral({
      checkHistory: hist([
        { name: "check", conclusion: "failure", atMs: now - 120_000 },
        { name: "check", conclusion: "success", atMs: now - 30_000 },
      ]),
      lastRetryOrHealAt: new Date(now - FLAKE_RETRY_COOLDOWN_MS - 1),
      nowMs: now,
    });
    assert.equal(out.flaky, true);
    assert.equal(out.defer, false);
  });

  it("allows first retry when flaky but no prior heal audit", () => {
    const now = 4_000_000;
    const out = evaluateFlakeRetryDeferral({
      checkHistory: hist([
        { name: "check", conclusion: "failure", atMs: now - 120_000 },
        { name: "check", conclusion: "success", atMs: now - 30_000 },
      ]),
      lastRetryOrHealAt: null,
      nowMs: now,
    });
    assert.equal(out.flaky, true);
    assert.equal(out.defer, false);
  });
});

describe("flakeRetryBlockedMessage", () => {
  it("includes rounded minutes", () => {
    assert.match(flakeRetryBlockedMessage(12 * 60_000), /~12m/);
  });
});
