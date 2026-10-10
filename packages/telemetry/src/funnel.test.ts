import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger.js";
import { FUNNEL_STAGES, trackFunnelEvent } from "./funnel.js";

describe("funnel instrumentation", () => {
  it("emits structured funnel_stage fields", () => {
    const lines: string[] = [];
    const log = createLogger({
      service: "test",
      write: (line) => lines.push(line),
    });
    trackFunnelEvent(log, {
      stage: "pr_accepted",
      workspaceId: "w1",
      projectId: "p1",
      taskId: "t1",
      userId: "u1",
    });
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(entry.event, "funnel");
    assert.equal(entry.funnel_stage, "pr_accepted");
    assert.equal(entry.workspaceId, "w1");
    assert.equal(entry.msg, "funnel");
  });

  it("covers PRODUCT §13 stages", () => {
    assert.deepEqual([...FUNNEL_STAGES], [
      "landing_visit",
      "github_connected",
      "brief_approved",
      "task_started",
      "pr_opened",
      "pr_accepted",
    ]);
  });
});
