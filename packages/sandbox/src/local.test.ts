import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { LocalSandboxManager } from "./local.js";
import { METADATA_IPV4, SandboxPolicyError } from "./policy.js";

describe("LocalSandboxManager", () => {
  it("clones at SHA, blocks metadata, destroys workdir", async () => {
    const mgr = new LocalSandboxManager();
    const sandbox = await mgr.create({
      runId: "run-1",
      workspaceId: "ws-1",
      repoUrl: "https://github.com/example/app.git",
      baseSha: "deadbeefcafebabe",
      branchName: "coppergate/task-1",
    });

    assert.equal(sandbox.baseSha, "deadbeefcafebabe");
    assert.equal(sandbox.runtime, "local");
    assert.equal(sandbox.cloneMode, "sim");
    await access(sandbox.workdir);

    const cat = await mgr.exec(sandbox, ["cat", ".coppergate-sandbox.json"]);
    assert.equal(cat.exitCode, 0);
    assert.ok(cat.stdout.includes("deadbeefcafebabe"));

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
    await assert.rejects(() => access(sandbox.workdir));

    // Destroyed sandbox cannot exec
    await assert.rejects(
      () => mgr.exec(sandbox, ["echo", "nope"]),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "destroyed",
    );
  });

  it("AG-023 rejects exec when hardDeadlineMs elapsed", async () => {
    const mgr = new LocalSandboxManager();
    const sandbox = await mgr.create({
      runId: "run-deadline",
      workspaceId: "ws-1",
      repoUrl: "https://github.com/example/app.git",
      baseSha: "deadbeefcafebabe",
    });
    await assert.rejects(
      () =>
        mgr.exec(sandbox, ["echo", "late"], {
          timeoutMs: 60_000,
          hardDeadlineMs: Date.now() - 1,
        }),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "timeout",
    );
    await mgr.destroy(sandbox);
  });
});
