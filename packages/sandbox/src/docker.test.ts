import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { DockerSandboxManager } from "./docker.js";
import { METADATA_IPV4, SandboxPolicyError } from "./policy.js";

describe("DockerSandboxManager", () => {
  it("creates workdir and execs via docker with hardened flags", async () => {
    const dockerCalls: string[][] = [];
    const mgr = new DockerSandboxManager({
      dockerExec: async (args) => {
        dockerCalls.push(args);
        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          durationMs: 1,
        };
      },
    });

    const sandbox = await mgr.create({
      runId: "run-d1",
      workspaceId: "ws-1",
      repoUrl: "https://github.com/example/app.git",
      baseSha: "abc123",
      branchName: "coppergate/task-1",
    });

    assert.equal(sandbox.runtime, "docker-gvisor");
    await access(sandbox.workdir);

    const result = await mgr.exec(sandbox, ["echo", "hi"]);
    assert.equal(result.exitCode, 0);
    assert.equal(dockerCalls.length, 1);
    const args = dockerCalls[0]!;
    assert.ok(args.includes("run"));
    assert.ok(args.includes("--rm"));
    assert.ok(args.some((a) => a.startsWith("--runtime=")));
    assert.ok(args.includes("--network=none"));
    assert.ok(args.includes("--cap-drop"));
    assert.ok(args.includes("ALL"));
    assert.ok(args.includes("--read-only"));
    assert.ok(!args.some((a) => a.includes("docker.sock")));

    await assert.rejects(
      () =>
        mgr.exec(sandbox, [
          "curl",
          `http://${METADATA_IPV4}/latest/meta-data/`,
        ]),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "egress_denied",
    );

    await mgr.destroy(sandbox);
    assert.equal(await mgr.isDestroyed(sandbox), true);
  });
});
