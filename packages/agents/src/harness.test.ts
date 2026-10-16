import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("openhands without sandbox falls back with no_sandbox status", async () => {
    const h = createContenderHarness({ kind: "openhands" });
    assert.match(h.capability, /sandbox/i);
    let sawFallback = false;
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
      if (ev.payload?.status === "no_sandbox") sawFallback = true;
    }
    assert.equal(sawFallback, true);
  });

  it("openhands with sandbox workdir writes a fix file", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-oh-"));
    const h = createContenderHarness({ kind: "openhands" });
    let sawSandbox = false;
    let completion = false;
    for await (const ev of h.run({
      runId: "r1",
      taskId: "t1",
      workspaceId: "w1",
      projectId: "p1",
      goal: "fix the bug",
      scope: "app",
      allowedPaths: ["app/page.tsx"],
      acceptanceCriteria: ["works"],
      baseSha: "abc123",
      toolAllowlist: ["read", "write"],
      spendCapMicros: 5000,
      sandboxWorkdir: workdir,
      sandboxId: "local_test",
    })) {
      if (ev.payload?.status === "sandbox") sawSandbox = true;
      if (ev.kind === "completion") completion = true;
    }
    assert.equal(sawSandbox, true);
    assert.equal(completion, true);
    const body = await readFile(join(workdir, "app/page.tsx"), "utf8");
    assert.match(body, /Signal fix|coppergateSignalFix|data-coppergate-run/);
    assert.doesNotMatch(body, /README/);
  });
});
