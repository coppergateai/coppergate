import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimOnce } from "./loop.js";

describe("worker loop helpers", () => {
  it("exports claimOnce", () => {
    assert.equal(typeof claimOnce, "function");
  });
});
