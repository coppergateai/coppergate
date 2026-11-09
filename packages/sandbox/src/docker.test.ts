import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { DockerSandboxManager, isFetchOnlyCommand } from "./docker.js";
import { METADATA_IPV4, SandboxPolicyError } from "./policy.js";

describe("DockerSandboxManager", () => {
  it("creates workdir and execs via docker with hardened flags", async () => {
    const dockerCalls: string[][] = [];
    const mgr = new DockerSandboxManager({
      dockerExec: async (args) => {
        if (args[0] === "info") {
          return { exitCode: 0, stdout: '{"runc":{},"runsc":{}}', stderr: "", durationMs: 1 };
        }
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
    assert.ok(args.includes("--runtime=runsc"));
    assert.ok(args.some((a) => /^-v=.+:\/cache:rw$/.test(a)));
    assert.ok(args.includes("GOPROXY=off"));
    if (process.getuid) {
      assert.ok(args.includes(`--user=${process.getuid()}:${process.getgid!()}`));
    }
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

  it("gives registry egress only to exact fetch-only argv", async () => {
    const dockerCalls: string[][] = [];
    const mgr = new DockerSandboxManager({
      dockerExec: async (args) => {
        if (args[0] === "info") {
          return { exitCode: 0, stdout: '{"runsc":{}}', stderr: "", durationMs: 1 };
        }
        dockerCalls.push(args);
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
      },
    });
    const sandbox = await mgr.create({
      runId: "run-d2",
      workspaceId: "ws-1",
      repoUrl: "https://github.com/example/app.git",
      baseSha: "abc123",
    });
    await mgr.exec(sandbox, ["pnpm", "install", "--lockfile-only", "--ignore-scripts"]);
    await mgr.exec(sandbox, ["go", "mod", "download"]);
    await mgr.exec(sandbox, ["pnpm", "install", "--lockfile-only"]);
    await mgr.exec(sandbox, ["npm", "run", "test", "--if-present"]);
    const net = dockerCalls.map((a) => a.find((x) => x.startsWith("--network="))!);
    assert.deepEqual(net, [
      "--network=bridge",
      "--network=bridge",
      "--network=none",
      "--network=none",
    ]);
    assert.ok(dockerCalls[0]!.includes("npm_config_registry=https://registry.npmjs.org/"));
    assert.ok(dockerCalls[1]!.includes("GOPROXY=https://proxy.golang.org"));
    assert.equal(isFetchOnlyCommand(["go", "mod", "download", "-x"]), false);
    await mgr.destroy(sandbox);
  });

  it("requireRunsc fails closed when the daemon lacks runsc", async () => {
    const mgr = new DockerSandboxManager({
      requireRunsc: true,
      dockerExec: async () => ({
        exitCode: 0,
        stdout: '{"runc":{}}',
        stderr: "",
        durationMs: 1,
      }),
    });
    await assert.rejects(
      () =>
        mgr.create({
          runId: "run-d3",
          workspaceId: "ws-1",
          repoUrl: "https://github.com/example/app.git",
          baseSha: "abc123",
        }),
      (err: unknown) =>
        err instanceof SandboxPolicyError && /runsc/.test(err.message),
    );
  });

  it("falls back to runc when runsc is missing and not required", async () => {
    const calls: string[][] = [];
    const mgr = new DockerSandboxManager({
      dockerExec: async (args) => {
        calls.push(args);
        return { exitCode: 0, stdout: '{"runc":{}}', stderr: "", durationMs: 1 };
      },
    });
    const sandbox = await mgr.create({
      runId: "run-d4",
      workspaceId: "ws-1",
      repoUrl: "https://github.com/example/app.git",
      baseSha: "abc123",
    });
    await mgr.exec(sandbox, ["echo", "hi"]);
    assert.ok(calls.at(-1)!.includes("--runtime=runc"));
    await mgr.destroy(sandbox);
  });
});
