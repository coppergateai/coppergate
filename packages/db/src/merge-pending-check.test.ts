import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMergeProtectionBlock,
  isPendingRequiredCheck,
  isTransientNotMergeable,
  resolveAutoMergeSkipPrs,
} from "./maintainer.js";

const PENDING = "Required status check \"check\" is expected.";

describe("merge pending required check (not a sticky block)", () => {
  it("classifies a not-yet-reported required check as pending + transient", () => {
    assert.equal(isPendingRequiredCheck(PENDING), true);
    assert.equal(isMergeProtectionBlock(PENDING), false);
    assert.equal(isTransientNotMergeable(PENDING), true);
  });

  it("keeps real protection blocks sticky", () => {
    const review = "At least 1 approving review is required by reviewers with write access.";
    assert.equal(isPendingRequiredCheck(review), false);
    assert.equal(isMergeProtectionBlock(review), true);
    assert.equal(
      isMergeProtectionBlock("Required status check \"check\" is failing."),
      true,
    );
  });

  it("retries a pending-check PR after the cooldown instead of skipping forever", () => {
    const now = Date.now();
    const row = (ageMs: number) => [
      {
        kind: "auto_merge",
        createdAt: new Date(now - ageMs),
        payload: { prNumber: 224, merged: false, message: PENDING, blocked: false },
      },
    ];
    assert.equal(resolveAutoMergeSkipPrs(row(60_000), now).has(224), true);
    assert.equal(resolveAutoMergeSkipPrs(row(31 * 60_000), now).has(224), false);
  });
});
