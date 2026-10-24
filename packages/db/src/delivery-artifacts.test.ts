import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeliveryCheckpoint,
  buildDeliveryReport,
  buildDiffSummary,
  parseDeliveryCheckpoint,
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

  it("builds and parses delivery checkpoints", () => {
    const checkpoint = buildDeliveryCheckpoint({
      taskId: "t1",
      runId: "r1",
      prUrl: "https://github.com/acme/app/pull/2",
      prNumber: 2,
      branchName: "coppergate/task-1",
      headSha: "def456",
      actualCostMicros: 500,
      awaitLiveCi: true,
      previewUrl: null,
    });
    assert.equal(checkpoint.kind, "delivery_checkpoint");
    const parsed = parseDeliveryCheckpoint(checkpoint);
    assert.ok(parsed);
    assert.equal(parsed!.awaitLiveCi, true);
    assert.equal(parsed!.prNumber, 2);
  });

  it("fail-closes legacy delivery_report to awaitLiveCi", () => {
    const parsed = parseDeliveryCheckpoint({
      kind: "delivery_report",
      prUrl: "https://github.com/acme/app/pull/3",
      prNumber: 3,
      branchName: "b",
      headSha: "abc",
      actualCostMicros: 1,
    });
    assert.ok(parsed);
    assert.equal(parsed!.awaitLiveCi, true);
  });

  it("rejects malformed checkpoints", () => {
    assert.equal(parseDeliveryCheckpoint({ kind: "delivery_checkpoint" }), null);
    assert.equal(parseDeliveryCheckpoint(null), null);
  });
});
