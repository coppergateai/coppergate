import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWaitlistEmail } from "./waitlist.js";

describe("normalizeWaitlistEmail", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeWaitlistEmail("  A@B.Com "), "a@b.com");
  });

  it("rejects invalid", () => {
    assert.equal(normalizeWaitlistEmail(""), null);
    assert.equal(normalizeWaitlistEmail("not-an-email"), null);
    assert.equal(normalizeWaitlistEmail("a@"), null);
  });
});
