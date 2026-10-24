import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStackValidation } from "./stack-validation.js";
import type { FakeCompletionPayload } from "./types.js";

const completion: FakeCompletionPayload = {
  branchName: "coppergate/t",
  headSha: "a".repeat(40),
  prNumber: 1,
  prUrl: "https://example.com/pr/1",
  filesChanged: ["app/page.tsx"],
  estimatedTokens: 100,
  actualCostMicros: 1000,
};

describe("runStackValidation", () => {
  it("uses fake path when forceFake", async () => {
    const report = await runStackValidation({
      goal: "ship it",
      acceptanceCriteria: ["ok"],
      completion,
      workdir: null,
      stack: "nextjs_ts",
      forceFake: true,
    });
    assert.equal(report.validator, "fake-v1");
    assert.equal(report.passed, true);
  });

  it("skips npm when no package.json", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-stack-"));
    const report = await runStackValidation({
      goal: "ship it",
      acceptanceCriteria: ["ok"],
      completion,
      workdir,
      stack: "nextjs_ts",
      forceFake: false,
      exec: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
      }),
    });
    assert.equal(report.validator, "stack-v1");
    assert.equal(report.passed, true);
  });

  it("runs lint when package.json has lint script", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-stack-"));
    await writeFile(
      join(workdir, "package.json"),
      JSON.stringify({ scripts: { lint: "echo ok" } }),
      "utf8",
    );
    const calls: string[][] = [];
    const report = await runStackValidation({
      goal: "ship it",
      acceptanceCriteria: ["ok"],
      completion,
      workdir,
      stack: "nextjs_ts",
      forceFake: false,
      exec: async (command) => {
        calls.push(command);
        if (command[0] === "node") {
          // Detect script presence: exit 0 = present
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
        }
        return { exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 };
      },
    });
    assert.equal(report.passed, true);
    assert.ok(calls.some((c) => c[0] === "npm" && c[2] === "lint"));
  });

  it("runs go test when go.mod present", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-stack-go-"));
    await writeFile(join(workdir, "go.mod"), "module example.com/x\n", "utf8");
    const calls: string[][] = [];
    const report = await runStackValidation({
      goal: "ship go fix",
      acceptanceCriteria: ["ok"],
      completion: {
        ...completion,
        filesChanged: ["cmd/server/main.go"],
      },
      workdir,
      stack: "go",
      forceFake: false,
      exec: async (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 };
      },
    });
    assert.equal(report.validator, "stack-v1");
    assert.equal(report.passed, true);
    assert.ok(
      calls.some(
        (c) =>
          c[0] === "go" &&
          c[1] === "test" &&
          c.includes("-p") &&
          c.includes("./..."),
      ),
    );
    assert.ok(report.checks.some((c) => c.name === "go_test" && c.passed));
  });

  it("fails go stack when go test exits non-zero", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-stack-go-fail-"));
    await writeFile(join(workdir, "go.mod"), "module example.com/x\n", "utf8");
    const report = await runStackValidation({
      goal: "ship go fix",
      acceptanceCriteria: ["ok"],
      completion,
      workdir,
      stack: "go",
      forceFake: false,
      exec: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "FAIL",
        durationMs: 1,
      }),
    });
    assert.equal(report.passed, false);
    assert.ok(report.checks.some((c) => c.name === "go_test" && !c.passed));
  });
});
