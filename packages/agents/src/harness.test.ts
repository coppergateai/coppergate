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

  it("openhands stub yields progress then completion path", async () => {
    const h = createContenderHarness({ kind: "openhands" });
    assert.match(h.capability, /stub/i);
    let sawStub = false;
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
      if (ev.payload?.status === "stub") sawStub = true;
    }
    assert.equal(sawStub, true);
  });
});
