import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapCheckRunPayload, mapCheckSuitePayload } from "./checks.js";

describe("CI check mapping", () => {
  it("marks success as passed and non-blocking", () => {
    const ev = mapCheckRunPayload({
      check_run: {
        id: 1,
        name: "build",
        status: "completed",
        conclusion: "success",
        head_sha: "abc",
      },
      repository: { full_name: "acme/app" },
    });
    assert.equal(ev.passed, true);
    assert.equal(ev.blocksAccept, false);
  });

  it("marks failure as blocking ACCEPTED", () => {
    const ev = mapCheckRunPayload({
      check_run: {
        id: 2,
        name: "test",
        status: "completed",
        conclusion: "failure",
        head_sha: "def",
      },
    });
    assert.equal(ev.passed, false);
    assert.equal(ev.blocksAccept, true);
  });

  it("maps check_suite timeout as blocking", () => {
    const ev = mapCheckSuitePayload({
      check_suite: {
        id: 9,
        status: "completed",
        conclusion: "timed_out",
        head_sha: "fff",
      },
    });
    assert.equal(ev.blocksAccept, true);
  });
});
