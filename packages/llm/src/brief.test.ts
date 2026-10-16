import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildClarifyingQuestions,
  generateBriefDraft,
  generateBriefDraftAsync,
} from "./brief.js";

describe("brief LLM stub", () => {
  it("returns at most 3 clarifying questions", () => {
    const qs = buildClarifyingQuestions("short");
    assert.ok(qs.length <= 3);
    assert.ok(qs.length >= 2);
  });

  it("marks needsAnswers when answers missing", () => {
    const draft = generateBriefDraft({
      idea: "Build a waitlist for my SaaS",
    });
    assert.equal(draft.needsAnswers, true);
    assert.ok(draft.clarifyingAnswers.length >= 2);
  });

  it("fills draft when ≥2 answers provided", () => {
    const draft = generateBriefDraft({
      idea: "Build a waitlist for my SaaS so founders can capture interest.",
      answers: [
        { id: "q1", answer: "Indie founders" },
        { id: "q2", answer: "Email capture with confirmation" },
      ],
    });
    assert.equal(draft.needsAnswers, false);
    assert.equal(draft.targetUser, "Indie founders");
    assert.ok(draft.acceptanceCriteria.length >= 1);
    assert.match(draft.scope, /Email capture/);
  });

  it("async path falls back to deterministic without API key", async () => {
    const prevKey = process.env.LLM_API_KEY;
    const prevOpen = process.env.OPENAI_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const draft = await generateBriefDraftAsync({
        idea: "Build a waitlist for my SaaS so founders can capture interest.",
        answers: [
          { id: "q1", answer: "Indie founders" },
          { id: "q2", answer: "Email capture with confirmation" },
        ],
      });
      assert.equal(draft.source, "deterministic");
      assert.equal(draft.needsAnswers, false);
    } finally {
      if (prevKey !== undefined) process.env.LLM_API_KEY = prevKey;
      if (prevOpen !== undefined) process.env.OPENAI_API_KEY = prevOpen;
    }
  });

  it("async path uses LLM when fetch returns JSON", async () => {
    const draft = await generateBriefDraftAsync(
      {
        idea: "Build a waitlist for my SaaS so founders can capture interest.",
        answers: [
          { id: "q1", answer: "Indie founders" },
          { id: "q2", answer: "Email capture with confirmation" },
        ],
      },
      {
        apiKey: "test-key",
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: "Waitlist MVP",
                      targetUser: "Indie founders",
                      problem: "No capture",
                      scope: "Email form",
                      nonGoals: "Payments",
                      acceptanceCriteria: ["Form submits"],
                    }),
                  },
                },
              ],
              usage: { total_tokens: 40 },
            }),
            { status: 200 },
          )) as typeof fetch,
      },
    );
    assert.equal(draft.source, "llm");
    assert.equal(draft.title, "Waitlist MVP");
  });
});
