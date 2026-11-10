import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendOpenProgramRows,
  nextArchitectureId,
} from "./architecture-backlog.js";
import {
  BUG_SCOUT_SECTION_HEADING,
  appendBugScoutOpenRowsToMarkdown,
  bugScoutFingerprint,
  collectBugEvidenceFromCiLogs,
  collectBugEvidenceFromRuns,
  extractBugScoutFingerprints,
  isBugScoutNoise,
  proposeBugOpenRows,
} from "./bug-scout.js";

describe("bug-scout", () => {
  it("nextArchitectureId allocates after max AG", () => {
    const md = `
| Done | AG-036 | Ship-gate heal-only merge | notes |
| Open | AG-029 | Meta-tournament off under lean | notes |
`;
    assert.equal(nextArchitectureId(md, "AG"), "AG-037");
  });

  it("skips heal-class noise", () => {
    assert.equal(
      isBugScoutNoise({ errorCode: "waiting_ci_timeout" }),
      true,
    );
    assert.equal(
      isBugScoutNoise({
        errorCode: "delivery_failed",
        taskTitle: "[ship-gate] Fix tip CI",
      }),
      true,
    );
    assert.equal(
      isBugScoutNoise({ errorCode: "lockfile_out_of_sync" }),
      false,
    );
  });

  it("clusters FAILED runs and filters noise", () => {
    const evidence = collectBugEvidenceFromRuns([
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        status: "FAILED",
        errorCode: "lockfile_out_of_sync",
        errorMessage: "pnpm-lock.yaml out of sync on sha deadbeef",
        taskTitle: "P-110: badge",
      },
      {
        id: "11111111-2222-3333-4444-555555555555",
        status: "FAILED",
        errorCode: "lockfile_out_of_sync",
        errorMessage: "pnpm-lock.yaml out of sync on sha cafebebe",
        taskTitle: "P-111: refuse",
      },
      {
        id: "99999999-8888-7777-6666-555555555555",
        status: "FAILED",
        errorCode: "waiting_ci_timeout",
        errorMessage: "required check missing",
        taskTitle: "P-112: vision",
      },
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff",
        status: "DONE",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]!.errorCode, "lockfile_out_of_sync");
    assert.equal(evidence[0]!.count, 2);
  });

  it("proposeBugOpenRows appends AG rows with fingerprint dedup", () => {
    const md = `
## Agent reliability (AG)

| Status | ID | Title | Notes |
| --- | --- | --- | --- |
| Done | AG-036 | Ship-gate | ok |
`;
    const evidence = collectBugEvidenceFromRuns([
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        status: "FAILED",
        errorCode: "lockfile_out_of_sync",
        errorMessage: "lockfile drift on install",
      },
    ]);
    const rows = proposeBugOpenRows({ markdown: md, evidence, max: 2 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, "AG-037");
    assert.match(rows[0]!.notes, /bug-scout:fp=/);

    const { content, changed } = appendBugScoutOpenRowsToMarkdown(md, rows);
    assert.equal(changed, true);
    assert.ok(content.includes(BUG_SCOUT_SECTION_HEADING));
    assert.match(content, /\| Open \| AG-037 \|/);

    const fps = extractBugScoutFingerprints(content);
    assert.ok(fps.has(rows[0]!.fingerprint));

    const again = proposeBugOpenRows({
      markdown: content,
      evidence,
      max: 2,
    });
    assert.equal(again.length, 0);
  });

  it("appendOpenProgramRows creates table under section", () => {
    const { content, changed } = appendOpenProgramRows("# Root\n", [
      {
        id: "AG-100",
        title: "Fix foo",
        notes: "bar <!-- bug-scout:fp=x_1 -->",
      },
    ]);
    assert.equal(changed, true);
    assert.match(content, /## Bug scout \(continuous\)/);
    assert.match(content, /\| Open \| AG-100 \| Fix foo \|/);
  });

  it("collectBugEvidenceFromCiLogs clusters failed checks", () => {
    const evidence = collectBugEvidenceFromCiLogs([
      {
        checkName: "unit tests",
        conclusion: "failure",
        headSha: "deadbeef",
        logSnippet: "AssertionError: expected 1 to equal 2",
      },
      {
        checkName: "unit tests",
        conclusion: "failure",
        headSha: "cafebebe",
        logSnippet: "AssertionError: expected 1 to equal 2",
      },
      {
        checkName: "[ship-gate] tip CI",
        conclusion: "failure",
        logSnippet: "red",
      },
    ]);
    assert.equal(evidence.length, 1);
    assert.match(evidence[0]!.title, /unit tests/);
    assert.equal(evidence[0]!.count, 2);
  });

  it("fingerprint is stable for similar messages", () => {
    const a = bugScoutFingerprint({
      errorCode: "stub_delivery",
      message: "Delivery failed for run abcdef12 on sha deadbeef",
    });
    const b = bugScoutFingerprint({
      errorCode: "stub_delivery",
      message: "Delivery failed for run 99999999 on sha cafebebe",
    });
    assert.equal(a, b);
  });
});
