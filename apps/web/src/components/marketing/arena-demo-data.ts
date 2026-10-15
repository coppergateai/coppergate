/**
 * Shared illustrative Arena dataset for marketing surfaces.
 * Labeled "Illustrative Arena" in UI — not live product results.
 * Structured to map onto Arena API fields later.
 */

export const ARENA_ALPHA = 0.5;

export type ContenderTone = "win" | "run" | "out" | "reject";

export type IllustrativeContender = {
  id: string;
  name: string;
  status: string;
  statusTone: ContenderTone;
  fitness: number;
  spendUsd: number;
  efficiency: number;
  ci: "Passing" | "Failed";
  tests: string;
  testsPassed: number;
  testsFailed: number;
  lint: "Clean" | "Warnings" | "Failed";
  policy: "Compliant" | "Blocked";
  promote: string;
  rejectionReason?: string;
  muted?: boolean;
};

function efficiency(fitness: number, spendUsd: number, alpha = ARENA_ALPHA) {
  if (spendUsd <= 0) return 0;
  return fitness / spendUsd ** alpha;
}

const raw = [
  {
    id: "a",
    name: "Contender A",
    status: "Selected",
    statusTone: "win" as const,
    fitness: 0.91,
    spendUsd: 14.2,
    ci: "Passing" as const,
    tests: "42 passed",
    testsPassed: 42,
    testsFailed: 0,
    lint: "Clean" as const,
    policy: "Compliant" as const,
    promote: "Ready for PR review",
  },
  {
    id: "b",
    name: "Contender B",
    status: "Rejected",
    statusTone: "reject" as const,
    fitness: 0.76,
    spendUsd: 11.8,
    ci: "Passing" as const,
    tests: "38 passed",
    testsPassed: 38,
    testsFailed: 0,
    lint: "Warnings" as const,
    policy: "Compliant" as const,
    promote: "Not selected",
    rejectionReason: "Lower efficiency-adjusted fitness than Contender A",
  },
  {
    id: "c",
    name: "Contender C",
    status: "Eliminated",
    statusTone: "out" as const,
    fitness: 0.41,
    spendUsd: 9.4,
    ci: "Failed" as const,
    tests: "27 passed · 3 failed",
    testsPassed: 27,
    testsFailed: 3,
    lint: "Failed" as const,
    policy: "Blocked" as const,
    promote: "Stopped",
    rejectionReason: "Failed required CI and policy checks",
    muted: true,
  },
] as const;

export const ILLUSTRATIVE_CONTENDERS: IllustrativeContender[] = raw.map((c) => ({
  ...c,
  efficiency: efficiency(c.fitness, c.spendUsd),
}));

export const ILLUSTRATIVE_ARENA = {
  label: "Illustrative Arena",
  task: "Fix checkout race condition",
  repo: "acme / storefront",
  branch: "coppergate/fix-checkout-race",
  commitSha: "a3f8c21",
  prNumber: 128,
  budgetUsd: 50,
  totalSpendUsd: 35.4,
  duration: "18m 42s",
  attempts: 3,
  runState: "Resolved",
  alpha: ARENA_ALPHA,
  selectionReason:
    "Selected because it passed all required checks and achieved the strongest efficiency-adjusted fitness.",
  criteria: [
    "CI must pass",
    "Policy paths must stay compliant",
    "Highest efficiency among qualifying contenders",
  ],
} as const;

export function formatUsd(n: number) {
  return `$${n.toFixed(2)}`;
}
