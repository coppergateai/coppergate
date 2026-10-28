import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createContenderHarness,
  harnessAsCodingAgent,
} from "./harness.js";

describe("ContenderHarness", () => {
  it("creates fake native harness", async () => {
    const h = createContenderHarness({ kind: "native_fake" });
    assert.equal(h.kind, "native_fake");
    const agent = harnessAsCodingAgent(h);
    const events = [];
    const input = {
      runId: "r1",
      taskId: "t1",
      workspaceId: "w1",
      projectId: "p1",
      goal: "x",
      scope: "y",
      allowedPaths: ["**/*"],
      acceptanceCriteria: ["works"],
      baseSha: "abc",
      toolAllowlist: ["read"],
      spendCapMicros: 1000,
    };
    for await (const ev of agent.run(input)) {
      events.push(ev);
    }
    assert.ok(events.length > 0);
  });

  it("openhands always fails closed (no stub path)", async () => {
    const prev = process.env.ALLOW_HARNESS_STUB;
    process.env.ALLOW_HARNESS_STUB = "1";
    try {
      const h = createContenderHarness({ kind: "openhands" });
      let sawDisabled = false;
      for await (const ev of h.run({
        runId: "r1",
        taskId: "t1",
        workspaceId: "w1",
        projectId: "p1",
        goal: "x",
        scope: "y",
        allowedPaths: ["**/*"],
        acceptanceCriteria: ["works"],
        baseSha: "abc",
        toolAllowlist: ["read"],
        spendCapMicros: 1000,
      })) {
        if (ev.payload?.code === "harness_stub_disabled") sawDisabled = true;
      }
      assert.equal(sawDisabled, true);
    } finally {
      if (prev === undefined) delete process.env.ALLOW_HARNESS_STUB;
      else process.env.ALLOW_HARNESS_STUB = prev;
    }
  });

  it("cursor_cloud always fails closed (no Fake fallback)", async () => {
    const h = createContenderHarness({ kind: "cursor_cloud" });
    let sawDisabled = false;
    for await (const ev of h.run({
      runId: "r1",
      taskId: "t1",
      workspaceId: "w1",
      projectId: "p1",
      goal: "x",
      scope: "y",
      allowedPaths: ["**/*"],
      acceptanceCriteria: ["works"],
      baseSha: "abc",
      toolAllowlist: ["read"],
      spendCapMicros: 1000,
    })) {
      if (ev.payload?.code === "harness_stub_disabled") sawDisabled = true;
    }
    assert.equal(sawDisabled, true);
  });
});
