import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authenticatedCloneUrl,
  scrubOriginCredentials,
  stripUrlCredentials,
} from "./clone-credentials.js";
import { LocalSandboxManager } from "./local.js";
import type { ExecResult } from "./types.js";

const TOKEN = "ghs_SECRETinstallTOKEN123";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function grepTree(dir: string, needle: string): Promise<string[]> {
  const hits: string[] = [];
  for (const entry of await readdir(dir, { recursive: true })) {
    const path = join(dir, entry);
    if (!(await stat(path)).isFile()) continue;
    if ((await readFile(path)).includes(needle)) hits.push(entry);
  }
  return hits;
}

describe("clone credentials", () => {
  it("strips userinfo from http(s) URLs only", () => {
    assert.equal(
      stripUrlCredentials(authenticatedCloneUrl("https://github.com/o/r.git", TOKEN)),
      "https://github.com/o/r.git",
    );
    assert.equal(
      stripUrlCredentials("https://oauth2:t@gitlab.com/o/r.git"),
      "https://gitlab.com/o/r.git",
    );
    assert.equal(stripUrlCredentials("/tmp/repo"), "/tmp/repo");
  });

  it("removes the token from .git after scrub", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-scrub-"));
    try {
      git(workdir, ["init", "-q"]);
      git(workdir, [
        "remote",
        "add",
        "origin",
        authenticatedCloneUrl("https://github.com/o/r.git", TOKEN),
      ]);
      assert.ok((await grepTree(join(workdir, ".git"), TOKEN)).length > 0);

      await scrubOriginCredentials("https://github.com/o/r.git", async (cmd) => {
        const stdout = git(workdir, cmd.slice(1));
        return { exitCode: 0, stdout, stderr: "", durationMs: 0 };
      });

      assert.deepEqual(await grepTree(join(workdir, ".git"), TOKEN), []);
      assert.equal(
        git(workdir, ["remote", "get-url", "origin"]).trim(),
        "https://github.com/o/r.git",
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it("fails closed when set-url fails", async () => {
    const failing = async (): Promise<ExecResult> => ({
      exitCode: 2,
      stdout: "",
      stderr: "no such remote",
      durationMs: 0,
    });
    await assert.rejects(() =>
      scrubOriginCredentials("https://github.com/o/r.git", failing),
    );
  });

  it("LocalSandboxManager git clone leaves a usable origin", async () => {
    const upstream = await mkdtemp(join(tmpdir(), "cg-upstream-"));
    const mgr = new LocalSandboxManager();
    try {
      git(upstream, ["init", "-q", "-b", "main"]);
      git(upstream, [
        "-c",
        "user.email=t@t",
        "-c",
        "user.name=t",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "init",
      ]);
      const sha = git(upstream, ["rev-parse", "HEAD"]).trim();

      const sandbox = await mgr.create({
        runId: "run-scrub",
        workspaceId: "ws-1",
        repoUrl: upstream,
        baseSha: sha,
        cloneMode: "git",
        authToken: TOKEN,
      });
      const res = await mgr.exec(sandbox, ["git", "remote", "get-url", "origin"]);
      assert.equal(res.stdout.trim(), upstream);
      assert.deepEqual(await grepTree(sandbox.workdir, TOKEN), []);
      await mgr.destroy(sandbox);
    } finally {
      await rm(upstream, { recursive: true, force: true });
    }
  });
});
