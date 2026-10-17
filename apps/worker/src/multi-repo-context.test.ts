import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeArchitectureContext } from "./multi-repo-context.js";

describe("mergeArchitectureContext", () => {
  it("merges strategy and multi-repo blocks", () => {
    const out = mergeArchitectureContext("Strategy: blitz", "Secondary: api");
    assert.ok(out?.includes("Strategy: blitz"));
    assert.ok(out?.includes("Secondary: api"));
  });

  it("returns undefined when both empty", () => {
    assert.equal(mergeArchitectureContext(undefined, ""), undefined);
  });
});
