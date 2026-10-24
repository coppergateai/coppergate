import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activityHref } from "./activity-href.js";

const ws = "ws-1";

describe("activityHref", () => {
  it("links arena.* events to the workspace arena", () => {
    assert.equal(
      activityHref(ws, "arena.stop", {}, "arena", "arena-1"),
      `/workspaces/${ws}/arena`,
    );
    assert.equal(
      activityHref(
        ws,
        "arena.pause",
        { projectId: "proj-1" },
        "arena",
        "arena-1",
      ),
      `/workspaces/${ws}/arena?focus=proj-1`,
    );
  });

  it("links signal events to settings", () => {
    assert.equal(
      activityHref(ws, "signal.ingested", null, null, null),
      `/workspaces/${ws}/settings?tab=signals`,
    );
  });

  it("links task + project meta to the task page", () => {
    assert.equal(
      activityHref(
        ws,
        "run.finished",
        { projectId: "p1", taskId: "t1" },
        "run",
        "r1",
      ),
      `/workspaces/${ws}/projects/p1/tasks/t1`,
    );
  });
});
