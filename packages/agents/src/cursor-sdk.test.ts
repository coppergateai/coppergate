import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CursorSdkCodingAgent,
  type CursorSdkBridge,
  type CursorSdkRunHandle,
} from "./cursor-sdk.js";
import { createCodingAgent } from "./create-agent.js";
import { FailoverCodingAgent } from "./failover.js";
import type { AgentEvent, AgentRunInput } from "./types.js";
import { snapshotWorkdir, diffWorkdirSnapshots } from "./workdir-diff.js";

const baseInput = (workdir: string): AgentRunInput => ({
  runId: "r-cursor",
  taskId: "t-cursor",
  workspaceId: "w1",
  projectId: "p1",
  goal: "Add a hello export",
  scope: "src",
  allowedPaths: ["src"],
  acceptanceCriteria: ["exports hello"],
  baseSha: "abc",
  toolAllowlist: ["edit"],
  spendCapMicros: 100_000,
  sandboxWorkdir: workdir,
});

function mockBridge(opts: {
  writeRelPath?: string;
  writeBody?: string;
  status?: string;
  result?: string;
  failCreate?: boolean;
}): CursorSdkBridge {
  return {
    async create({ local }) {
      if (opts.failCreate) {
        throw new Error("insufficient_quota on create");
      }
      return {
        async send() {
          const run: CursorSdkRunHandle = {
            async *stream() {
              yield {
                type: "assistant",
                message: {
                  content: [{ type: "text", text: "Working on it" }],
                },
              };
              yield { type: "tool_call", name: "Write" };
            },
            async wait() {
              if (opts.writeRelPath && opts.writeBody) {
                const abs = join(local.cwd, opts.writeRelPath);
                await mkdir(join(local.cwd, "src"), { recursive: true });
                await writeFile(abs, opts.writeBody, "utf8");
              }
              return {
                status: opts.status ?? "finished",
                result: opts.result,
              };
            },
          };
          return run;
        },
        async [Symbol.asyncDispose]() {},
      };
    },
  };
}

describe("workdir-diff", () => {
  it("detects new and modified files under allowlist", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-diff-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
    const before = await snapshotWorkdir(root, ["src"]);
    await writeFile(join(root, "src", "a.ts"), "export const a = 2;\n", "utf8");
    await writeFile(join(root, "src", "b.ts"), "export const b = 1;\n", "utf8");
    await writeFile(join(root, "outside.ts"), "nope\n", "utf8");
    const after = await snapshotWorkdir(root, ["src"]);
    const changed = await diffWorkdirSnapshots(root, before, after);
    assert.equal(changed.length, 2);
    assert.ok(changed.some((c) => c.path === "src/a.ts" && c.action === "modify"));
    assert.ok(changed.some((c) => c.path === "src/b.ts" && c.action === "create"));
  });
});

describe("CursorSdkCodingAgent", () => {
  it("emits file events from workdir diff and completes", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-cursor-"));
    await mkdir(join(root, "src"), { recursive: true });
    const agent = new CursorSdkCodingAgent({
      apiKey: "cursor_test",
      model: "composer-2.5",
      bridge: mockBridge({
        writeRelPath: "src/hello.ts",
        writeBody:
          "export function hello() { return 'world'; }\n",
      }),
    });

    const events: AgentEvent[] = [];
    for await (const ev of agent.run(baseInput(root))) {
      events.push(ev);
    }

    assert.ok(events.some((e) => e.kind === "progress" && e.payload?.provider === "cursor"));
    assert.ok(events.some((e) => e.kind === "tool"));
    assert.ok(
      events.some(
        (e) => e.kind === "file" && e.payload?.path === "src/hello.ts",
      ),
    );
    assert.ok(events.some((e) => e.kind === "completion"));
    const body = await readFile(join(root, "src", "hello.ts"), "utf8");
    assert.match(body, /hello/);
  });

  it("maps create quota failure to provider_quota", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-cursor-q-"));
    const agent = new CursorSdkCodingAgent({
      apiKey: "cursor_test",
      bridge: mockBridge({ failCreate: true }),
    });
    const events: AgentEvent[] = [];
    for await (const ev of agent.run(baseInput(root))) {
      events.push(ev);
    }
    assert.ok(
      events.some(
        (e) => e.kind === "error" && e.payload?.code === "provider_quota",
      ),
    );
  });

  it("refuses empty file changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-cursor-empty-"));
    await mkdir(join(root, "src"), { recursive: true });
    const agent = new CursorSdkCodingAgent({
      apiKey: "cursor_test",
      bridge: mockBridge({}),
    });
    const events: AgentEvent[] = [];
    for await (const ev of agent.run(baseInput(root))) {
      events.push(ev);
    }
    assert.ok(
      events.some(
        (e) => e.kind === "error" && e.payload?.code === "no_file_changes",
      ),
    );
  });
});

describe("createCodingAgent cursor wiring", () => {
  it("builds Cursor primary when kind=cursor", () => {
    const agent = createCodingAgent({
      kind: "cursor",
      apiKey: "cursor_test",
      cursorBridge: mockBridge({}),
    });
    assert.ok(agent instanceof CursorSdkCodingAgent);
  });

  it("wraps OpenAI primary with Cursor fallback", () => {
    const agent = createCodingAgent({
      kind: "openai",
      apiKey: "sk-primary",
      fetchImpl: async () => new Response("{}", { status: 500 }),
      fallback: {
        kind: "cursor",
        apiKey: "cursor_fb",
        cursorBridge: mockBridge({}),
      },
    });
    assert.ok(agent instanceof FailoverCodingAgent);
  });
});
