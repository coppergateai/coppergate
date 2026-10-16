/**
 * Brief generation — deterministic stub with optional OpenAI-compatible LLM.
 * Caps clarifying questions at 3 per PRODUCT FR-02.
 */

import {
  chatCompletionJson,
  parseJsonObject,
  resolveLlmChatConfig,
  type LlmChatConfig,
} from "./openai-chat.js";

export type ClarifyingQuestion = {
  id: string;
  question: string;
};

export type ClarifyingAnswer = {
  id: string;
  question: string;
  answer: string | null;
};

export type BriefDraftContent = {
  title: string;
  targetUser: string;
  problem: string;
  scope: string;
  nonGoals: string;
  acceptanceCriteria: string[];
  clarifyingAnswers: ClarifyingAnswer[];
  /** true when answers are still needed before a complete draft */
  needsAnswers: boolean;
  /** Which generator produced the draft. */
  source?: "deterministic" | "llm";
};

const MAX_QUESTIONS = 3;

export function buildClarifyingQuestions(idea: string): ClarifyingQuestion[] {
  const trimmed = idea.trim();
  const questions: ClarifyingQuestion[] = [
    {
      id: "q1",
      question: "Who is the primary user for this product?",
    },
    {
      id: "q2",
      question: "What is the single most important outcome in the first release?",
    },
  ];
  if (trimmed.length < 80) {
    questions.push({
      id: "q3",
      question: "What should explicitly be out of scope for MVP?",
    });
  }
  return questions.slice(0, MAX_QUESTIONS);
}

function answerMap(
  answers: Array<{ id: string; answer: string }> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of answers ?? []) {
    const v = a.answer.trim();
    if (v) map.set(a.id, v);
  }
  return map;
}

/**
 * Deterministic draft brief. If fewer than 2 answers are provided, returns a
 * skeleton with clarifying questions (needsAnswers=true).
 */
export function generateBriefDraft(input: {
  idea: string;
  projectName?: string;
  answers?: Array<{ id: string; answer: string }>;
}): BriefDraftContent {
  const idea = input.idea.trim();
  const questions = buildClarifyingQuestions(idea);
  const answered = answerMap(input.answers);

  const clarifyingAnswers: ClarifyingAnswer[] = questions.map((q) => ({
    id: q.id,
    question: q.question,
    answer: answered.get(q.id) ?? null,
  }));

  const answeredCount = clarifyingAnswers.filter((q) => q.answer).length;
  if (answeredCount < 2) {
    const titleHint =
      idea.split(/[.!\n]/)[0]?.trim().slice(0, 80) ||
      input.projectName ||
      "Untitled product";
    return {
      title: titleHint,
      targetUser: "",
      problem: idea,
      scope: "",
      nonGoals: "",
      acceptanceCriteria: [],
      clarifyingAnswers,
      needsAnswers: true,
      source: "deterministic",
    };
  }

  const targetUser =
    clarifyingAnswers.find((q) => q.id === "q1")?.answer ?? "Primary users";
  const outcome =
    clarifyingAnswers.find((q) => q.id === "q2")?.answer ??
    "Deliver a working MVP";
  const nonGoals =
    clarifyingAnswers.find((q) => q.id === "q3")?.answer ??
    "Payments, multi-tenant enterprise features, and mobile apps";

  const titleBase =
    idea.split(/[.!\n]/)[0]?.trim().slice(0, 72) ||
    input.projectName ||
    "Product";

  return {
    title: titleBase,
    targetUser,
    problem: idea,
    scope: `Deliver: ${outcome}. Stack: Next.js + TypeScript.`,
    nonGoals,
    acceptanceCriteria: [
      `Primary user (${targetUser}) can complete the core flow for: ${outcome}`,
      "Happy path works on the supported Next.js TypeScript stack",
      "Out-of-scope items from non-goals are not implemented",
    ],
    clarifyingAnswers,
    needsAnswers: false,
    source: "deterministic",
  };
}

/**
 * Prefer OpenAI-compatible LLM when configured; fall back to deterministic stub.
 */
export async function generateBriefDraftAsync(
  input: {
    idea: string;
    projectName?: string;
    answers?: Array<{ id: string; answer: string }>;
  },
  llm?: Partial<LlmChatConfig>,
): Promise<BriefDraftContent> {
  const fallback = generateBriefDraft(input);
  if (fallback.needsAnswers) return fallback;

  const config = resolveLlmChatConfig(llm);
  if (!config) return fallback;

  try {
    const result = await chatCompletionJson(config, {
      system:
        "You are Coppergate's product strategist. Return strict JSON with keys: title, targetUser, problem, scope, nonGoals, acceptanceCriteria (string array, 2-5 items). Keep scope to Next.js+TypeScript MVP. No markdown.",
      user: JSON.stringify({
        idea: input.idea.trim(),
        projectName: input.projectName ?? null,
        answers: input.answers ?? [],
      }),
    });
    const parsed = parseJsonObject(result.content);
    if (!parsed) return fallback;

    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 120)
        : fallback.title;
    const targetUser =
      typeof parsed.targetUser === "string" && parsed.targetUser.trim()
        ? parsed.targetUser.trim()
        : fallback.targetUser;
    const problem =
      typeof parsed.problem === "string" && parsed.problem.trim()
        ? parsed.problem.trim()
        : fallback.problem;
    const scope =
      typeof parsed.scope === "string" && parsed.scope.trim()
        ? parsed.scope.trim()
        : fallback.scope;
    const nonGoals =
      typeof parsed.nonGoals === "string" && parsed.nonGoals.trim()
        ? parsed.nonGoals.trim()
        : fallback.nonGoals;
    const acceptanceCriteria = Array.isArray(parsed.acceptanceCriteria)
      ? parsed.acceptanceCriteria
          .filter((c): c is string => typeof c === "string" && !!c.trim())
          .map((c) => c.trim())
          .slice(0, 5)
      : fallback.acceptanceCriteria;

    if (acceptanceCriteria.length < 1) return fallback;

    return {
      title,
      targetUser,
      problem,
      scope,
      nonGoals,
      acceptanceCriteria,
      clarifyingAnswers: fallback.clarifyingAnswers,
      needsAnswers: false,
      source: "llm",
    };
  } catch {
    return fallback;
  }
}
