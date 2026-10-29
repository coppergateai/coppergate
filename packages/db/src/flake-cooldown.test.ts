import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSuppressFlakeRetry } from "@coppergate/signals";
import { checkNameFromCiFailureTitle } from "./flake-cooldown.js";

describe("flake-cooldown helpers (AG-021)", () => {
  it("parses check name from ci_failure title", () => {
    assert.equal(
      checkNameFromCiFailureTitle("CI failed: check (org/repo)"),
      "check",
    );
    assert.equal(checkNameFromCiFailureTitle("CI failed: lint"), "lint");
    assert.equal(checkNameFromCiFailureTitle("other"), null);
  });

  it("suppresses when history oscillates", () => {
    const now = Date.now();
    const out = shouldSuppressFlakeRetry(
      [
        { name: "check", conclusion: "failure", at: now - 90_000 },
        { name: "check", conclusion: "success", at: now - 30_000 },
      ],
      { name: "check", nowMs: now },
    );
    assert.equal(out.suppress, true);
  });
});
