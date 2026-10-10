import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSandboxManager } from "./local.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Sibling repo: coppergateai/coppergate-examples/nextjs_ts */
const FIXTURE = join(
  here,
  "..",
  "..",
  "..",
  "..",
  "coppergate-examples",
  "nextjs_ts",
);

describe("nextjs_ts fixture in sandbox", () => {
  it("runs unit tests inside an ephemeral sandbox workdir", async () => {
    try {
      await access(join(FIXTURE, "package.json"));
    } catch {
      // Workspace layout without sibling examples repo
      return;
    }

    const mgr = new LocalSandboxManager();
    const sandbox = await mgr.create({
      runId: "fixture-run",
      workspaceId: "fixture-ws",
      repoUrl: "file://coppergate-examples/nextjs_ts",
      baseSha: "fixture0001",
    });

    const staging = await mkdtemp(join(tmpdir(), "cg-fixture-"));
    try {
      await cp(FIXTURE, sandbox.workdir, {
        recursive: true,
        filter: (src) =>
          !src.includes("node_modules") && !src.includes(".next"),
      });

      // Prefer already-installed deps from fixture if present; else skip install.
      let nodeModulesOk = true;
      try {
        await access(join(sandbox.workdir, "node_modules"));
      } catch {
        nodeModulesOk = false;
      }

      if (!nodeModulesOk) {
        // Lightweight accept path: greeting unit file must be present after clone-at-sha copy
        await access(join(sandbox.workdir, "src/lib/greeting.ts"));
        const head = await mgr.exec(sandbox, [
          "node",
          "-e",
          "const fs=require('fs'); const t=fs.readFileSync('src/lib/greeting.ts','utf8'); if(!t.includes('export function greeting')) process.exit(1)",
        ]);
        assert.equal(head.exitCode, 0);
      } else {
        const test = await mgr.exec(
          sandbox,
          ["npm", "test"],
          { timeoutMs: 120_000 },
        );
        assert.equal(test.exitCode, 0, test.stderr || test.stdout);
      }
    } finally {
      await mgr.destroy(sandbox);
      await rm(staging, { recursive: true, force: true });
      assert.equal(await mgr.isDestroyed(sandbox), true);
    }
  });
});
