import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ClaudeCodeCodingAgent,
  type ClaudeCodeBridge,
} from "./claude-code.js";
import { createCodingAgent } from "./create-agent.js";
import { FailoverCodingAgent } from "./failover.js";
import type { AgentEvent, AgentRunInput } from "./types.js";

const baseInput = (workdir: string): AgentRunInput => ({
  runId: "r-claude",
  taskId: "t-claude",
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
  failResult?: boolean;
  failQuery?: boolean;
  costUsd?: number;
}): ClaudeCodeBridge {
  return {
    async *query({ options }) {
      if (opts.failQuery) {
        throw new Error("insufficient_quota on query");
      }
      yield {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Working on it" },
            { type: "tool_use", name: "Write" },
          ],
        },
      };
      if (opts.writeRelPath && opts.writeBody) {
        const abs = join(options.cwd, opts.writeRelPath);
        await mkdir(join(options.cwd, "src"), { recursive: true });
        await writeFile(abs, opts.writeBody, "utf8");
      }
      if (opts.failResult) {
        yield {
          type: "result",
          subtype: "error_during_execution",
          result: "rate limit exceeded",
        };
        return;
      }
      yield {
        type: "result",
        subtype: "success",
        result: "done",
        total_cost_usd: opts.costUsd,
      };
    },
  };
}

describe("ClaudeCodeCodingAgent", () => {
  it("emits file events from workdir diff and completes", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-claude-"));
    await mkdir(join(root, "src"), { recursive: true });
    const agent = new ClaudeCodeCodingAgent({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-5",
      bridge: mockBridge({
        writeRelPath: "src/hello.ts",
        writeBody:
          "export function hello() { return 'world'; }\n",
        costUsd: 0.0025,
      }),
    });

    const events: AgentEvent[] = [];
    for await (const ev of agent.run(baseInput(root))) {
      events.push(ev);
    }

    assert.ok(
      events.some(
        (e) => e.kind === "progress" && e.payload?.provider === "claude_code",
      ),
    );
    assert.ok(events.some((e) => e.kind === "tool"));
    assert.ok(
      events.some(
        (e) => e.kind === "file" && e.payload?.path === "src/hello.ts",
      ),
    );
    assert.ok(events.some((e) => e.kind === "completion"));
    const cost = events.find((e) => e.kind === "cost");
    assert.equal(cost?.payload?.costMicros, 2500);
    const body = await readFile(join(root, "src", "hello.ts"), "utf8");
    assert.match(body, /hello/);
  });

  it("maps query quota failure to provider_quota", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-claude-q-"));
    const agent = new ClaudeCodeCodingAgent({
      apiKey: "sk-ant-test",
      bridge: mockBridge({ failQuery: true }),
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

  it("maps result error rate limit to provider_quota", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-claude-rl-"));
    await mkdir(join(root, "src"), { recursive: true });
    const agent = new ClaudeCodeCodingAgent({
      apiKey: "sk-ant-test",
      bridge: mockBridge({ failResult: true }),
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
    const root = await mkdtemp(join(tmpdir(), "cg-claude-empty-"));
    await mkdir(join(root, "src"), { recursive: true });
    const agent = new ClaudeCodeCodingAgent({
      apiKey: "sk-ant-test",
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

describe("createCodingAgent claude_code wiring", () => {
  it("builds Claude Code primary when kind=claude_code", () => {
    const agent = createCodingAgent({
      kind: "claude_code",
      apiKey: "sk-ant-test",
      claudeCodeBridge: mockBridge({}),
    });
    assert.ok(agent instanceof ClaudeCodeCodingAgent);
  });

  it("wraps OpenAI primary with Claude Code fallback", () => {
    const agent = createCodingAgent({
      kind: "openai",
      apiKey: "sk-primary",
      fetchImpl: async () => new Response("{}", { status: 500 }),
      fallback: {
        kind: "claude_code",
        apiKey: "sk-ant-fb",
        claudeCodeBridge: mockBridge({}),
      },
    });
    assert.ok(agent instanceof FailoverCodingAgent);
  });
});
