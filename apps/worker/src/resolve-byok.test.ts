import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirrors resolveByokForProfile model precedence without DB. */
function pickModel(
  preferredModel: string | null | undefined,
  credentialModel: string | null | undefined,
): string | undefined {
  return preferredModel?.trim() || credentialModel || undefined;
}

describe("BYOK model precedence", () => {
  it("prefers profile preferredModel over connection model", () => {
    assert.equal(pickModel("gpt-4o", "gpt-4o-mini"), "gpt-4o");
  });

  it("falls back to connection model", () => {
    assert.equal(pickModel(null, "gpt-4o-mini"), "gpt-4o-mini");
    assert.equal(pickModel("  ", "gpt-4o-mini"), "gpt-4o-mini");
  });

  it("returns undefined when neither set", () => {
    assert.equal(pickModel(null, null), undefined);
  });
});
