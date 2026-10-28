import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLaneTaskId } from "./lane-tournament-task.js";

describe("resolveLaneTaskId", () => {
  it("returns null when no contender has a latest run", () => {
    assert.equal(
      resolveLaneTaskId({
        contenders: [{ id: "c1", latestRun: null }],
      }),
      null,
    );
  });

  it("picks the majority taskId among latest runs", () => {
    assert.equal(
      resolveLaneTaskId({
        contenders: [
          {
            id: "c1",
            latestRun: { taskId: "t-a", taskTitle: "A" },
          },
          {
            id: "c2",
            latestRun: { taskId: "t-b", taskTitle: "B" },
          },
          {
            id: "c3",
            latestRun: { taskId: "t-a", taskTitle: "A" },
          },
        ],
      }),
      "t-a",
    );
  });
});
