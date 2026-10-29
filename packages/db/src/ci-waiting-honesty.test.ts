import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CI_WAITING_COPY,
  classifyCiWaiting,
  detectRequiredCheckFlake,
  missingRequiredCheckNames,
  waitingCiTimeoutMessage,
} from "./ci-waiting-honesty.js";

describe("ci-waiting-honesty (AG-017)", () => {
  it("lists missing required names vs helper-only greens", () => {
    assert.deepEqual(
      missingRequiredCheckNames(
        [{ name: "lint", passed: true, blocksAccept: false, status: "completed", conclusion: "success", detailsUrl: null, createdAt: new Date() }],
        ["test"],
      ),
      ["test"],
    );
  });

  it("classifies required-missing while WAITING_CI — not Accept-ready", () => {
    const out = classifyCiWaiting({
      checks: [
        {
          name: "lint",
          passed: true,
          blocksAccept: false,
          status: "completed",
          conclusion: "success",
          detailsUrl: null,
          createdAt: new Date(),
        },
      ],
      requiredNames: ["test"],
      statusAwaitingCi: true,
      blocking: false,
      passed: false,
    });
    assert.equal(out.kind, "required_missing");
    assert.match(out.detail ?? "", /never reported/i);
    assert.match(out.detail ?? "", /Accept-ready/i);
  });

  it("detects flake on required check history", () => {
    const now = Date.now();
    const history = [
      {
        name: "test",
        conclusion: "success",
        passed: true,
        at: new Date(now - 60_000),
      },
      {
        name: "test",
        conclusion: "failure",
        passed: false,
        at: new Date(now - 30_000),
      },
    ];
    assert.equal(
      detectRequiredCheckFlake(history, ["test"], now).flaky,
      true,
    );
    const out = classifyCiWaiting({
      checks: [
        {
          name: "test",
          passed: false,
          blocksAccept: true,
          status: "completed",
          conclusion: "failure",
          detailsUrl: null,
          createdAt: new Date(now),
        },
      ],
      requiredNames: ["test"],
      statusAwaitingCi: true,
      blocking: true,
      passed: false,
      checkHistory: history,
      nowMs: now,
    });
    assert.equal(out.kind, "blocking");
  });

  it("classifies flake when not blocking but history oscillates", () => {
    const now = Date.now();
    const history = [
      {
        name: "test",
        conclusion: "success",
        passed: true,
        at: new Date(now - 120_000),
      },
      {
        name: "test",
        conclusion: "failure",
        passed: false,
        at: new Date(now - 60_000),
      },
    ];
    const out = classifyCiWaiting({
      checks: [
        {
          name: "test",
          passed: true,
          blocksAccept: false,
          status: "completed",
          conclusion: "success",
          detailsUrl: null,
          createdAt: new Date(now),
        },
      ],
      requiredNames: ["test"],
      statusAwaitingCi: true,
      blocking: false,
      passed: true,
      checkHistory: history,
      nowMs: now,
    });
    assert.equal(out.kind, "flake");
    assert.match(out.detail ?? "", /flaking/i);
  });

  it("timeout copy distinguishes required-missing from generic", () => {
    const msg = waitingCiTimeoutMessage({
      checks: [],
      requiredNames: ["test"],
      statusAwaitingCi: true,
      blocking: false,
      passed: false,
    });
    assert.match(msg, /timed out/i);
    assert.match(msg, /test/);
    assert.match(msg, /Not Accept-ready/i);
    assert.notEqual(msg, CI_WAITING_COPY.timeoutGeneric);
  });
});
