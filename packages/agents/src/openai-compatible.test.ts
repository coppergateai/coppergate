import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenAiCompatibleCodingAgent } from "./openai-compatible.js";
import { createCodingAgent } from "./create-agent.js";
import { FakeCodingAgent } from "./fake.js";
import { isFakeCompletionPayload } from "./fake.js";

describe("OpenAiCompatibleCodingAgent", () => {
  it("enforces spend cap", async () => {
    const agent = new OpenAiCompatibleCodingAgent({
      apiKey: "sk-test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Change app/page.tsx" } }],
            usage: { total_tokens: 50_000 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      priceMicrosPer1kTokens: 2_000,
    });

    const events = [];
    for await (const ev of agent.run({
      runId: "r1",
      taskId: "t1",
      workspaceId: "w1",
      projectId: "p1",
      goal: "Add button",
      scope: "Landing",
      allowedPaths: ["app/page.tsx"],
      acceptanceCriteria: ["Works"],
      baseSha: "abc",
      toolAllowlist: [],
      spendCapMicros: 1_000,
    })) {
      events.push(ev);
    }

    assert.ok(events.some((e) => e.kind === "cost"));
    assert.ok(
      events.some(
        (e) => e.kind === "error" && e.payload?.code === "spend_cap",
      ),
    );
    assert.ok(!events.some((e) => e.kind === "completion"));
  });

  it("emits completion under cap", async () => {
    const agent = new OpenAiCompatibleCodingAgent({
      apiKey: "sk-test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "### FILE: README.md",
                    "```",
                    "# Docs",
                    "Clear product increment for acceptance.",
                    "```",
                  ].join("\n"),
                },
              },
            ],
            usage: { total_tokens: 400 },
          }),
          { status: 200 },
        ),
    });

    const events = [];
    for await (const ev of agent.run({
      runId: "r2",
      taskId: "t2",
      workspaceId: "w1",
      projectId: "p1",
      goal: "Docs",
      scope: "README",
      allowedPaths: ["README.md"],
      acceptanceCriteria: ["Clear"],
      baseSha: "def",
      toolAllowlist: [],
      spendCapMicros: 100_000,
    })) {
      events.push(ev);
    }

    const completion = events.find((e) => e.kind === "completion");
    assert.ok(completion);
    assert.ok(isFakeCompletionPayload(completion!.payload));
  });
});

describe("createCodingAgent", () => {
  it("defaults to FakeCodingAgent without key", () => {
    const prev = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const agent = createCodingAgent({ forceFake: true });
      assert.ok(agent instanceof FakeCodingAgent);
      const agent2 = createCodingAgent({ apiKey: "" });
      assert.ok(agent2 instanceof FakeCodingAgent);
    } finally {
      if (prev) process.env.LLM_API_KEY = prev;
    }
  });

  it("selects OpenAI-compatible when key provided", () => {
    const agent = createCodingAgent({
      apiKey: "sk-x",
      fetchImpl: async () => new Response("{}", { status: 500 }),
    });
    assert.ok(agent instanceof OpenAiCompatibleCodingAgent);
  });
});
