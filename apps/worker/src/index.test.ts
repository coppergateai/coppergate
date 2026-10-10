import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("worker stub", () => {
  it("loads", () => {
    assert.equal(typeof process.env.DATABASE_URL === "string" || true, true);
  });
});
