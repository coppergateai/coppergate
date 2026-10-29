import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BISECT_HARD_TIMEOUT_MS,
  fakeBisectSteps,
  planRegressionBisect,
} from "@coppergate/signals";
import { execRegressionBisectPlan } from "./bisect-exec.js";
import type {
  ExecResult,
  SandboxHandle,
  SandboxManager,
} from "./types.js";

function mockManager(
  onExec: (command: string[], timeoutMs?: number) => ExecResult | Promise<ExecResult>,
): SandboxManager {
  const sandbox: SandboxHandle = {
    id: "mock",
    runId: "run",
    workspaceId: "ws",
    workdir: "/tmp/mock",
    baseSha: "abc1234",
    createdAt: new Date(),
    runtime: "local",
  };
  return {
    create: async () => sandbox,
    exec: async (_sandbox, command, options) =>
      onExec(command, options?.timeoutMs),
    destroy: async () => undefined,
    isDestroyed: async () => false,
  };
}

describe("execRegressionBisectPlan", () => {
  it("passes shrinking timeoutMs across fake steps", async () => {
    const plan = planRegressionBisect({
      goodSha: "aaa1111",
      badSha: "bbb2222",
      reproCommand: "echo ok",
      timeoutMs: 10_000,
    })!;
    const fakeSteps = fakeBisectSteps(plan);
    const timeouts: number[] = [];
    let nowMs = 0;
    const now = () => nowMs;

    const mgr = mockManager((_cmd, timeoutMs) => {
      timeouts.push(timeoutMs ?? -1);
      nowMs += 6_000;
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 100,
      };
    });

    const result = await execRegressionBisectPlan(mgr, (await mgr.create({
      runId: "r",
      workspaceId: "w",
      repoUrl: "https://github.com/x/y",
      baseSha: "abc1234",
    })), plan, { fakeSteps, now });

    assert.equal(result.status, "hard_timeout");
    assert.equal(result.stepsRun, 2);
    assert.ok(timeouts[0]! <= 10_000);
    assert.ok(timeouts[1]! < timeouts[0]!);
  });

  it("never exceeds planRegressionBisect hard cap", () => {
    const plan = planRegressionBisect({
      goodSha: "aaa1111",
      badSha: "bbb2222",
      timeoutMs: BISECT_HARD_TIMEOUT_MS + 60_000,
    })!;
    assert.equal(plan.timeoutMs, BISECT_HARD_TIMEOUT_MS);
  });
});
