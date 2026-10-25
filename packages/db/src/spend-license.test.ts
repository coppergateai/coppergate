import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openIdFromTaskTitle, SpendLicenseError } from "./spend-license.js";

describe("spend-license", () => {
  it("openIdFromTaskTitle extracts program IDs", () => {
    assert.equal(openIdFromTaskTitle("AG-011: Pause honesty"), "AG-011");
    assert.equal(openIdFromTaskTitle("P-104: Open Program Runtime"), "P-104");
    assert.equal(openIdFromTaskTitle("scaffold without id"), null);
  });

  it("SpendLicenseError carries code", () => {
    const err = new SpendLicenseError(
      "missing_open_id",
      "No Open ID — Arena cannot spend without an Open Program line",
    );
    assert.equal(err.code, "missing_open_id");
    assert.match(err.message, /No Open ID/);
  });
});
