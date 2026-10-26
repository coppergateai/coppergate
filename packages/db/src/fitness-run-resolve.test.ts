import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Contract: headSha attach only when exactly one run matches. */
function pickUniqueByHeadSha<T>(rows: T[]): T | null {
  if (rows.length !== 1) return null;
  return rows[0] ?? null;
}

describe("fitness headSha uniqueness", () => {
  it("attaches when exactly one match", () => {
    assert.deepEqual(pickUniqueByHeadSha([{ id: "a" }]), { id: "a" });
  });

  it("rejects zero matches", () => {
    assert.equal(pickUniqueByHeadSha([]), null);
  });

  it("rejects ambiguous matches", () => {
    assert.equal(pickUniqueByHeadSha([{ id: "a" }, { id: "b" }]), null);
  });
});
