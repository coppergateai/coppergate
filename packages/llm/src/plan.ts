/**
 * Deterministic plan stub from an approved brief.
 * Real planner LLM lands later.
 */

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
