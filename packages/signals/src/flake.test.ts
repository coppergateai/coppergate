import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectFlakePattern } from "./flake.js";

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
});
