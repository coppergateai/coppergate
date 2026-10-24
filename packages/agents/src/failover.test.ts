import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FailoverCodingAgent } from "./failover.js";
import { OpenAiCompatibleCodingAgent } from "./openai-compatible.js";
import { createCodingAgent } from "./create-agent.js";
import type { AgentEvent, AgentRunInput, CodingAgent } from "./types.js";

const baseInput: AgentRunInput = {
  runId: "r-fo",
  taskId: "t-fo",
  workspaceId: "w1",
  projectId: "p1",
  goal: "Add feature",
  scope: "app",
  allowedPaths: ["README.md"],
  acceptanceCriteria: ["done"],
  baseSha: "abc",
  toolAllowlist: [],
  spendCapMicros: 100_000,
};

const okBody = JSON.stringify({
  choices: [
    {
      message: {
        content: [
          "### FILE: README.md",
          "```",
          "# Product increment with real acceptance coverage",
          "```",
        ].join("\n"),
      },
    },
  ],
  usage: { total_tokens: 40 },
});

describe("FailoverCodingAgent", () => {
  it("fails over to secondary after primary throws provider error", async () => {
    let secondaryHits = 0;
    const primary = new OpenAiCompatibleCodingAgent({
      apiKey: "sk-primary",
      maxRetries: 0,
      fetchImpl: async () =>
        new Response("unavailable", { status: 503 }),
    });
    const secondary = new OpenAiCompatibleCodingAgent({
      apiKey: "sk-secondary",
      baseUrl: "https://fallback.example/v1",
      model: "backup-model",
      fetchImpl: async (url) => {
        secondaryHits += 1;
        assert.match(String(url), /fallback\.example/);
        return new Response(okBody, { status: 200 });
      },
    });

    const agent = new FailoverCodingAgent(primary, secondary, "backup-model");
    const events: AgentEvent[] = [];
    for await (const ev of agent.run(baseInput)) {
      events.push(ev);
    }

    assert.equal(secondaryHits, 1);
    assert.ok(
      events.some(
        (e) =>
          e.kind === "progress" && e.payload?.code === "provider_failover",
      ),
    );
    assert.ok(events.some((e) => e.kind === "completion"));
  });

  it("does not failover after policy error events (no throw)", async () => {
    let secondaryHits = 0;
    const primary = new OpenAiCompatibleCodingAgent({
      apiKey: "sk-primary",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "no files here" } }],
            usage: { total_tokens: 10 },
          }),
          { status: 200 },
        ),
    });
    const secondary: CodingAgent = {
      async *run() {
        secondaryHits += 1;
        yield { kind: "completion", message: "should not run" };
      },
    };

    const agent = new FailoverCodingAgent(primary, secondary);
    const events: AgentEvent[] = [];
    for await (const ev of agent.run(baseInput)) {
      events.push(ev);
    }

    assert.equal(secondaryHits, 0);
    assert.ok(
      events.some(
        (e) => e.kind === "error" && e.payload?.code === "no_file_blocks",
      ),
    );
    assert.ok(!events.some((e) => e.payload?.code === "provider_failover"));
  });

  it("does not failover on abort", async () => {
    let secondaryHits = 0;
    const controller = new AbortController();
    const primary = new OpenAiCompatibleCodingAgent({
      apiKey: "sk-primary",
      maxRetries: 0,
      fetchImpl: async (_url, init) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              ),
            { once: true },
          );
          setTimeout(() => controller.abort(), 5);
        });
      },
    });
    const secondary: CodingAgent = {
      async *run() {
        secondaryHits += 1;
        yield* [];
      },
    };

    const agent = new FailoverCodingAgent(primary, secondary);
    const events: AgentEvent[] = [];
    for await (const ev of agent.run({
      ...baseInput,
      abortSignal: controller.signal,
    })) {
      events.push(ev);
    }

    assert.equal(secondaryHits, 0);
    assert.ok(
      events.some((e) => e.kind === "error" && e.payload?.code === "aborted"),
    );
  });
});

describe("createCodingAgent failover wiring", () => {
  it("wraps FailoverCodingAgent when fallback key differs", () => {
    const agent = createCodingAgent({
      apiKey: "sk-primary",
      fallback: { apiKey: "sk-fallback", model: "backup" },
      fetchImpl: async () => new Response("{}", { status: 500 }),
    });
    assert.ok(agent instanceof FailoverCodingAgent);
  });

  it("skips wrap when fallback is identical to primary", () => {
    const agent = createCodingAgent({
      apiKey: "sk-same",
      baseUrl: "https://api.example/v1",
      model: "m1",
      fallback: {
        apiKey: "sk-same",
        baseUrl: "https://api.example/v1",
        model: "m1",
      },
      fetchImpl: async () => new Response("{}", { status: 500 }),
    });
    assert.ok(agent instanceof OpenAiCompatibleCodingAgent);
  });
});
