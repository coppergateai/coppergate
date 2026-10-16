/**
 * Plan generation from an approved brief — deterministic stub + optional LLM.
 */

import {
  chatCompletionJson,
  parseJsonObject,
  resolveLlmChatConfig,
  type LlmChatConfig,
} from "./openai-chat.js";

export type PlanTaskDraft = {
  key: string;
  title: string;
  goal: string;
  scope: string;
  allowedPaths: string[];
  acceptanceCriteria: string[];
  estimateMicros: number;
  estimateComplexity: "S" | "M" | "L";
  /** Temporary keys of predecessors within the plan draft */
  dependsOn: string[];
  priority: number;
};

export type PlanMilestoneDraft = {
  title: string;
  description: string;
  tasks: PlanTaskDraft[];
};

export type BriefPlanInput = {
  title: string;
  targetUser: string;
  problem: string;
  scope: string;
  nonGoals: string;
  acceptanceCriteria: string[];
};

const COMPLEXITY_MICROS = { S: 50_000, M: 150_000, L: 400_000 } as const;

export function generatePlanDraft(brief: BriefPlanInput): PlanMilestoneDraft[] {
  const title = brief.title.trim() || "Product";
  const criteria =
    brief.acceptanceCriteria.length > 0
      ? brief.acceptanceCriteria
      : [`Deliver core flow for ${title}`];

  const m1Tasks: PlanTaskDraft[] = [
    {
      key: "t1",
      title: "Scaffold project structure",
      goal: `Set up Next.js TypeScript baseline for ${title}`,
      scope: "App router layout, env stubs, health route; no business logic yet",
      allowedPaths: ["app/**", "package.json", "tsconfig.json"],
      acceptanceCriteria: [
        "App builds with `next build`",
        "Health endpoint responds",
      ],
      estimateMicros: COMPLEXITY_MICROS.S,
      estimateComplexity: "S",
      dependsOn: [],
      priority: 10,
    },
    {
      key: "t2",
      title: "Implement primary user flow",
      goal: `Enable ${brief.targetUser || "users"} to complete: ${criteria[0]}`,
      scope: brief.scope || `Core MVP scope for ${title}`,
      allowedPaths: ["app/**", "src/**", "components/**"],
      acceptanceCriteria: criteria.slice(0, 3),
      estimateMicros: COMPLEXITY_MICROS.M,
      estimateComplexity: "M",
      dependsOn: ["t1"],
      priority: 20,
    },
    {
      key: "t3",
      title: "Wire validation and empty states",
      goal: "Make the happy path resilient with clear empty/error states",
      scope: "Form validation, loading/error UI; exclude items in non-goals",
      allowedPaths: ["app/**", "components/**"],
      acceptanceCriteria: [
        "Invalid input shows user-visible errors",
        `Non-goals remain unimplemented: ${brief.nonGoals || "n/a"}`,
      ],
      estimateMicros: COMPLEXITY_MICROS.S,
      estimateComplexity: "S",
      dependsOn: ["t2"],
      priority: 30,
    },
  ];

  const m2Tasks: PlanTaskDraft[] = [
    {
      key: "t4",
      title: "Add smoke tests for core flow",
      goal: "Protect the primary acceptance criteria with automated checks",
      scope: "Unit or route-level tests for the happy path",
      allowedPaths: ["**/*.test.ts", "**/*.test.tsx", "app/**"],
      acceptanceCriteria: [
        "At least one automated test covers the primary flow",
        "Tests pass locally",
      ],
      estimateMicros: COMPLEXITY_MICROS.S,
      estimateComplexity: "S",
      dependsOn: ["t3"],
      priority: 40,
    },
  ];

  return [
    {
      title: `MVP — ${title}`,
      description: brief.problem.slice(0, 400) || `First milestone for ${title}`,
      tasks: m1Tasks,
    },
    {
      title: "Hardening",
      description: "Tests and polish before review",
      tasks: m2Tasks,
    },
  ];
}

function normalizeComplexity(value: unknown): "S" | "M" | "L" {
  if (value === "S" || value === "M" || value === "L") return value;
  return "M";
}

function coerceTask(
  raw: Record<string, unknown>,
  index: number,
): PlanTaskDraft | null {
  const key =
    typeof raw.key === "string" && raw.key.trim()
      ? raw.key.trim().slice(0, 32)
      : `t${index + 1}`;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 120)
      : null;
  const goal =
    typeof raw.goal === "string" && raw.goal.trim() ? raw.goal.trim() : null;
  if (!title || !goal) return null;

  const complexity = normalizeComplexity(raw.estimateComplexity);
  const estimateMicros =
    typeof raw.estimateMicros === "number" && Number.isFinite(raw.estimateMicros)
      ? Math.max(10_000, Math.min(2_000_000, Math.floor(raw.estimateMicros)))
      : COMPLEXITY_MICROS[complexity];

  return {
    key,
    title,
    goal,
    scope:
      typeof raw.scope === "string" && raw.scope.trim()
        ? raw.scope.trim()
        : goal,
    allowedPaths: Array.isArray(raw.allowedPaths)
      ? raw.allowedPaths
          .filter((p): p is string => typeof p === "string" && !!p.trim())
          .slice(0, 8)
      : ["app/**", "src/**"],
    acceptanceCriteria: Array.isArray(raw.acceptanceCriteria)
      ? raw.acceptanceCriteria
          .filter((c): c is string => typeof c === "string" && !!c.trim())
          .slice(0, 5)
      : [goal],
    estimateMicros,
    estimateComplexity: complexity,
    dependsOn: Array.isArray(raw.dependsOn)
      ? raw.dependsOn
          .filter((d): d is string => typeof d === "string" && !!d.trim())
          .slice(0, 8)
      : [],
    priority:
      typeof raw.priority === "number" && Number.isFinite(raw.priority)
        ? Math.floor(raw.priority)
        : (index + 1) * 10,
  };
}

/**
 * Prefer OpenAI-compatible LLM when configured; fall back to deterministic stub.
 */
export async function generatePlanDraftAsync(
  brief: BriefPlanInput,
  llm?: Partial<LlmChatConfig>,
): Promise<PlanMilestoneDraft[]> {
  const fallback = generatePlanDraft(brief);
  const config = resolveLlmChatConfig(llm);
  if (!config) return fallback;

  try {
    const result = await chatCompletionJson(config, {
      system:
        "You are Coppergate's planner. Return strict JSON: { milestones: [{ title, description, tasks: [{ key, title, goal, scope, allowedPaths, acceptanceCriteria, estimateComplexity (S|M|L), dependsOn, priority }] }] }. 1-2 milestones, 2-5 tasks total. Paths must be Next.js-friendly. No markdown.",
      user: JSON.stringify(brief),
    });
    const parsed = parseJsonObject(result.content);
    const milestonesRaw = Array.isArray(parsed?.milestones)
      ? parsed!.milestones
      : null;
    if (!milestonesRaw?.length) return fallback;

    const milestones: PlanMilestoneDraft[] = [];
    let taskIndex = 0;
    for (const m of milestonesRaw.slice(0, 3)) {
      if (!m || typeof m !== "object") continue;
      const row = m as Record<string, unknown>;
      const title =
        typeof row.title === "string" && row.title.trim()
          ? row.title.trim()
          : null;
      if (!title) continue;
      const tasksRaw = Array.isArray(row.tasks) ? row.tasks : [];
      const tasks: PlanTaskDraft[] = [];
      for (const t of tasksRaw.slice(0, 6)) {
        if (!t || typeof t !== "object") continue;
        const task = coerceTask(t as Record<string, unknown>, taskIndex);
        taskIndex += 1;
        if (task) tasks.push(task);
      }
      if (!tasks.length) continue;
      milestones.push({
        title,
        description:
          typeof row.description === "string"
            ? row.description.slice(0, 400)
            : "",
        tasks,
      });
    }

    return milestones.length > 0 ? milestones : fallback;
  } catch {
    return fallback;
  }
}
