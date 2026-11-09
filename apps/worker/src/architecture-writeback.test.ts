import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createLogger } from "@coppergate/telemetry";
import {
  reconcileArchitectureDone,
  writeArchitectureTaskDone,
} from "./architecture-writeback.js";

const PROGRAM = [
  "| Status | ID | Title | Notes |",
  "| --- | --- | --- | --- |",
  "| Done | AG-036 | Behind update | x |",
  "| Open | AG-037 | Bug scout | x |",
  "| Open | AG-040 | Design scout | x |",
  "| Open | AG-025 | Replan under $1 | x |",
].join("\n");

type Put = { url: string; message: string; content: string };

/** Minimal GitHub Contents API: one file in `owner/repo` at `path`. */
function installGithubStub(file: { repo: string; path: string; content: string }) {
  const puts: Put[] = [];
  const gets: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const target = `https://api.github.com/repos/${file.repo}/contents/${file.path}`;
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as {
        message: string;
        content: string;
      };
      puts.push({
        url: u,
        message: body.message,
        content: Buffer.from(body.content, "base64").toString("utf8"),
      });
      return new Response(JSON.stringify({ commit: { sha: "c1" } }));
    }
    gets.push(u);
    if (u !== target) return new Response("{}", { status: 404 });
    return new Response(
      JSON.stringify({
        type: "file",
        encoding: "base64",
        content: Buffer.from(file.content, "utf8").toString("base64"),
        sha: "s1",
        path: file.path,
      }),
    );
  }) as typeof fetch;
  return { puts, gets, restore: () => (globalThis.fetch = original) };
}

const log = createLogger({ service: "test", write: () => undefined });

describe("architecture writeback", () => {
  const prevRepo = process.env.ARCHITECTURE_REPO;
  const prevPaths = process.env.ARCHITECTURE_PATHS;
  beforeEach(() => {
    // Global env points elsewhere (multi-project worker) — project binding must win.
    process.env.ARCHITECTURE_REPO = "kprompt/kprompt-architecture";
    process.env.ARCHITECTURE_PATHS = "AGENT-TASKS.md";
  });
  afterEach(() => {
    process.env.ARCHITECTURE_REPO = prevRepo;
    process.env.ARCHITECTURE_PATHS = prevPaths;
    if (prevRepo === undefined) delete process.env.ARCHITECTURE_REPO;
    if (prevPaths === undefined) delete process.env.ARCHITECTURE_PATHS;
  });

  it("writes to the project-bound program, not the env repo", async () => {
    const gh = installGithubStub({
      repo: "coppergateai/coppergate-architecture",
      path: "docs/OPEN_PROGRAM.md",
      content: PROGRAM,
    });
    try {
      const res = await writeArchitectureTaskDone(log, {
        token: "t",
        taskTitle: "Coppergate: AG-040: Design scout",
        prNumber: 229,
        architectureRepo: "coppergateai/coppergate-architecture",
        architecturePaths: "docs/OPEN_PROGRAM.md",
      });
      assert.deepEqual(res, { id: "AG-040", path: "docs/OPEN_PROGRAM.md" });
      assert.equal(gh.puts.length, 1);
      assert.match(gh.puts[0]!.content, /\| Done \| AG-040 \|/);
      assert.match(gh.puts[0]!.message, /mark AG-040 Done \(merged PR #229\)/);
      assert.ok(gh.gets.every((u) => !u.includes("kprompt")));
    } finally {
      gh.restore();
    }
  });

  it("reconcile marks every merged Open ID in one commit and skips Done rows", async () => {
    const gh = installGithubStub({
      repo: "coppergateai/coppergate-architecture",
      path: "docs/OPEN_PROGRAM.md",
      content: PROGRAM,
    });
    try {
      const res = await reconcileArchitectureDone(log, {
        token: "t",
        owner: "coppergateai",
        repo: "coppergate",
        architectureRepo: "coppergateai/coppergate-architecture",
        architecturePaths: "docs/OPEN_PROGRAM.md",
        listMerged: async () =>
          new Map([
            ["AG-040", 226],
            ["AG-037", 219],
            ["AG-036", 218],
          ]),
      });
      assert.deepEqual(res?.ids, ["AG-040", "AG-037"]);
      assert.equal(gh.puts.length, 1);
      const put = gh.puts[0]!;
      assert.match(put.content, /\| Done \| AG-037 \|/);
      assert.match(put.content, /\| Done \| AG-040 \|/);
      assert.match(put.content, /\| Open \| AG-025 \|/);
      assert.match(
        put.message,
        /mark AG-040, AG-037 Done \(merged coppergateai\/coppergate#226, coppergateai\/coppergate#219\)/,
      );
    } finally {
      gh.restore();
    }
  });

  it("reconcile is a no-op when everything merged is already Done", async () => {
    const gh = installGithubStub({
      repo: "coppergateai/coppergate-architecture",
      path: "docs/OPEN_PROGRAM.md",
      content: PROGRAM,
    });
    try {
      const res = await reconcileArchitectureDone(log, {
        token: "t",
        owner: "coppergateai",
        repo: "coppergate",
        architectureRepo: "coppergateai/coppergate-architecture",
        architecturePaths: "docs/OPEN_PROGRAM.md",
        listMerged: async () => new Map([["AG-036", 218]]),
      });
      assert.equal(res, null);
      assert.equal(gh.puts.length, 0);
    } finally {
      gh.restore();
    }
  });
});
