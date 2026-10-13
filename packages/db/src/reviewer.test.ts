import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreWithRulesReviewer } from "./reviewer.js";

describe("rules reviewer (TASK042)", () => {
  it("flags missing diff as blocker and missing PR as warn", () => {
    const report = scoreWithRulesReviewer({
      hasDiff: false,
      hasPr: false,
      validationPassed: null,
      filesChanged: 0,
    });
    assert.equal(report.kind, "review_findings");
    assert.ok(report.findings.some((f) => f.code === "missing_diff"));
    assert.ok(report.findings.some((f) => f.code === "missing_pr"));
    assert.match(report.summary, /blocker/);
  });

  it("reports clean review when evidence is present", () => {
    const report = scoreWithRulesReviewer({
      hasDiff: true,
      hasPr: true,
      validationPassed: true,
      filesChanged: 3,
    });
    assert.equal(report.summary, "Clean automated review");
    assert.ok(report.findings.some((f) => f.code === "validation_ok"));
  });

  it("warns on large diffs", () => {
    const report = scoreWithRulesReviewer({
      hasDiff: true,
      hasPr: true,
      validationPassed: true,
      filesChanged: 25,
    });
    assert.ok(report.findings.some((f) => f.code === "large_diff"));
    assert.match(report.summary, /warning/);
  });
});
