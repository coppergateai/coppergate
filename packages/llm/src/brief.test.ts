import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildClarifyingQuestions, generateBriefDraft } from "./brief.js";

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
});
