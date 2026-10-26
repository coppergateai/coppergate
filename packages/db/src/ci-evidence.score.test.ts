import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRequiredCheckNames,
  scoreCiChecks,
} from "./ci-evidence.js";

describe("scoreCiChecks", () => {
  it("defaults required names to test", () => {
    assert.deepEqual(resolveRequiredCheckNames({}), ["test"]);
    assert.deepEqual(
      resolveRequiredCheckNames({ CI_REQUIRED_CHECK_NAMES: "test,lint" }),
      ["test", "lint"],
    );
  });

  it("does not accept when required context is missing but helpers are green", () => {
    const scored = scoreCiChecks(
      [
        { name: "lint", passed: true, blocksAccept: false },
        { name: "Build", passed: false, blocksAccept: true },
      ],
      { requiredNames: ["test"], statusAwaitingCi: false },
    );
    assert.equal(scored.passed, false);
    assert.equal(scored.blocking, false);
    assert.equal(scored.ciSatisfied, false);
    assert.equal(scored.acceptReady, false);
  });

  it("accepts when required context is green", () => {
    const scored = scoreCiChecks(
      [
        { name: "lint", passed: true, blocksAccept: false },
        { name: "test", passed: true, blocksAccept: false },
      ],
      { requiredNames: ["test"], statusAwaitingCi: false },
    );
    assert.equal(scored.passed, true);
    assert.equal(scored.acceptReady, true);
  });

  it("blocks when required context fails", () => {
    const scored = scoreCiChecks(
      [{ name: "test", passed: false, blocksAccept: true }],
      { requiredNames: ["test"], statusAwaitingCi: false },
    );
    assert.equal(scored.blocking, true);
    assert.equal(scored.passed, false);
    assert.equal(scored.acceptReady, false);
  });

  it("keeps empty checks vacuous and WAITING_CI fail-closed for accept", () => {
    const empty = scoreCiChecks([], {
      requiredNames: ["test"],
      statusAwaitingCi: false,
    });
    assert.equal(empty.passed, true);
    assert.equal(empty.acceptReady, true);

    const waitingEmpty = scoreCiChecks([], {
      requiredNames: ["test"],
      statusAwaitingCi: true,
    });
    assert.equal(waitingEmpty.ciSatisfied, false);
    assert.equal(waitingEmpty.acceptReady, false);

    const waiting = scoreCiChecks(
      [{ name: "test", passed: true, blocksAccept: false }],
      { requiredNames: ["test"], statusAwaitingCi: true },
    );
    assert.equal(waiting.ciSatisfied, true);
    assert.equal(waiting.acceptReady, false);
  });
});
