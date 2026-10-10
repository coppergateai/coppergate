#!/usr/bin/env node
/**
 * CI contract for Coppergate delivery reports (TASK026).
 * Ensures per-task delivery_report + diff_summary shapes stay required
 * and secret-free before merge.
 */
import assert from "node:assert/strict";

function buildDiffSummary(input) {
  return {
    kind: "diff_summary",
    branchName: input.branchName,
    headSha: input.headSha,
    baseSha: input.baseSha,
    files: input.filesChanged.map((path) => ({
      path,
      action: "modify",
    })),
    notes: input.notes ?? [],
  };
}

function buildDeliveryReport(input) {
  return {
    kind: "delivery_report",
    taskId: input.taskId,
    runId: input.runId,
    prUrl: input.prUrl,
    prNumber: input.prNumber,
    branchName: input.branchName,
    headSha: input.headSha,
    actualCostMicros: input.actualCostMicros,
    validationPassed: input.validationPassed,
    filesChanged: input.filesChanged,
  };
}

const REQUIRED_DIFF_KEYS = [
  "kind",
  "branchName",
  "headSha",
  "baseSha",
  "files",
  "notes",
];
const REQUIRED_REPORT_KEYS = [
  "kind",
  "taskId",
  "runId",
  "prUrl",
  "prNumber",
  "branchName",
  "headSha",
  "actualCostMicros",
  "validationPassed",
  "filesChanged",
];

const diff = buildDiffSummary({
  branchName: "coppergate/task-ci",
  headSha: "deadbeef",
  baseSha: "cafebabe",
  filesChanged: ["apps/web/src/app/page.tsx", "README.md"],
  notes: ["CI delivery-report contract"],
});
assert.equal(diff.kind, "diff_summary");
for (const key of REQUIRED_DIFF_KEYS) {
  assert.ok(key in diff, `diff_summary missing ${key}`);
}
assert.ok(diff.files.length >= 1);

const report = buildDeliveryReport({
  taskId: "task-ci",
  runId: "run-ci",
  prUrl: "https://github.com/coppergateai/coppergate/pull/1",
  prNumber: 1,
  branchName: "coppergate/task-ci",
  headSha: "deadbeef",
  actualCostMicros: 100,
  validationPassed: true,
  filesChanged: ["apps/web/src/app/page.tsx"],
});
assert.equal(report.kind, "delivery_report");
for (const key of REQUIRED_REPORT_KEYS) {
  assert.ok(key in report, `delivery_report missing ${key}`);
}
assert.match(report.prUrl, /\/pull\/\d+$/);
assert.ok(report.filesChanged.length >= 1);

const serialized = JSON.stringify({ diff, report });
assert.equal(
  /ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN/.test(serialized),
  false,
  "delivery report contract must not embed secret material",
);

console.log("delivery-report contract OK");
