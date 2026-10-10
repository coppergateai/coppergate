import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeliveryReport,
  buildDiffSummary,
} from "./delivery-artifacts.js";
import { containsSecretMaterial } from "./redact.js";

describe("delivery artifacts", () => {
  it("builds a redacted diff summary without secrets", () => {
    const diff = buildDiffSummary({
      branchName: "coppergate/task-1",
      headSha: "abc",
      baseSha: "def",
      filesChanged: ["app/page.tsx", "README.md"],
      notes: ["token ghp_abcdefghijklmnopqrstuvwxyz012345 should redact"],
    });
    assert.equal(diff.kind, "diff_summary");
    assert.equal(diff.files.length, 2);
    assert.equal(containsSecretMaterial(JSON.stringify(diff)), false);
  });

  it("builds a delivery report for review", () => {
    const report = buildDeliveryReport({
      taskId: "t1",
      runId: "r1",
      prUrl: "https://github.com/acme/app/pull/1",
      prNumber: 1,
      branchName: "coppergate/task-1",
      headSha: "abc",
      actualCostMicros: 1200,
      validationPassed: true,
      filesChanged: ["app/page.tsx"],
    });
    assert.equal(report.kind, "delivery_report");
    assert.equal(report.validationPassed, true);
    assert.ok(report.prUrl.includes("/pull/"));
  });
});
