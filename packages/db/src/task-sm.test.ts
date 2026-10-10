import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  TaskTransitionError,
  TASK_STATUSES,
} from "./task-sm.js";

describe("task state machine", () => {
  it("allows the happy path", () => {
    const path = [
      "DRAFT",
      "READY_FOR_APPROVAL",
      "QUEUED",
      "RUNNING",
      "VALIDATING",
      "REVIEW_REQUIRED",
      "ACCEPTED",
      "DONE",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(canTransition(path[i]!, path[i + 1]!), true);
    }
  });

  it("rejects illegal edges", () => {
    assert.equal(canTransition("DRAFT", "QUEUED"), false);
    assert.equal(canTransition("DONE", "RUNNING"), false);
    assert.equal(canTransition("CANCELLED", "DRAFT"), false);
    assert.throws(
      () => assertTransition("DRAFT", "RUNNING"),
      (err: unknown) =>
        err instanceof TaskTransitionError &&
        err.code === "illegal_transition",
    );
  });

  it("covers every status in the allow-list map", () => {
    for (const status of TASK_STATUSES) {
      assert.ok(status in ALLOWED_TRANSITIONS);
    }
  });
});
