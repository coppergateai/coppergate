import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDeliveryCheckpoint } from "@coppergate/db";
import { shouldSkipPrReviewGithubPost } from "./pr-review-checkpoint.js";

describe("pr-review checkpoint (F4)", () => {
  it("skips GitHub POST when checkpoint matches PR number", () => {
    const checkpoint = buildDeliveryCheckpoint({
      taskId: "t1",
      runId: "r1",
      prUrl: "https://github.com/acme/app/pull/9",
      prNumber: 9,
      branchName: "review/pr-9",
      headSha: "abc",
      actualCostMicros: 0,
      awaitLiveCi: false,
    });
    assert.equal(shouldSkipPrReviewGithubPost(checkpoint, 9), true);
    assert.equal(shouldSkipPrReviewGithubPost(checkpoint, 8), false);
    assert.equal(shouldSkipPrReviewGithubPost(null, 9), false);
  });
});
