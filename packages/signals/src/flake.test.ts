import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectFlakePattern,
  shouldSuppressFlakeRetry,
} from "./flake.js";

describe("detectFlakePattern", () => {
  it("detects fail then pass", () => {
    const now = Date.now();
    const result = detectFlakePattern([
      { name: "test", conclusion: "failure", at: now - 60_000 },
      { name: "test", conclusion: "success", at: now - 10_000 },
    ]);
    assert.equal(result.flaky, true);
  });

  it("ignores single failure", () => {
    const result = detectFlakePattern([
      { name: "test", conclusion: "failure", at: Date.now() },
    ]);
    assert.equal(result.flaky, false);
  });

  it("shouldSuppressFlakeRetry gates Retry thrash (AG-021)", () => {
    const now = Date.now();
    const history = [
      { name: "check", conclusion: "failure", at: now - 120_000 },
      { name: "check", conclusion: "success", at: now - 60_000 },
      { name: "check", conclusion: "failure", at: now - 5_000 },
    ];
    assert.equal(
      shouldSuppressFlakeRetry(history, { name: "check", nowMs: now }).suppress,
      true,
    );
    assert.equal(
      shouldSuppressFlakeRetry(
        [{ name: "check", conclusion: "failure", at: now }],
        { name: "check", nowMs: now },
      ).suppress,
      false,
    );
  });
});
