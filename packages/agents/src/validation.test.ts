import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFakeValidation } from "./validation.js";

describe("runFakeValidation", () => {
  const completion = {
    branchName: "coppergate/task-abc",
    headSha: "fakehead",
    prNumber: 1001,
    prUrl: "https://github.com/example/repo/pull/1001",
    filesChanged: ["app/page.tsx"],
    estimatedTokens: 100,
    actualCostMicros: 1000,
  };

  it("passes for normal goals", () => {
    const report = runFakeValidation({
      goal: "Add form",
      acceptanceCriteria: ["Works"],
      completion,
    });
    assert.equal(report.passed, true);
  });

  it("fails when goal contains [FAIL_VALIDATION]", () => {
    const report = runFakeValidation({
      goal: "Break things [FAIL_VALIDATION]",
      acceptanceCriteria: ["Works"],
      completion,
    });
    assert.equal(report.passed, false);
    assert.ok(report.summary.includes("failed"));
  });
});
