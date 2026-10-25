/**
 * TASK102 — default signal → bounded role spawn matrix.
 * Agents cannot invent roles outside the catalog.
 */

export const BOUNDED_PROFILE_KEYS = [
  "fixer",
  "engineer",
  "proposer",
  "reviewer",
  "security",
  "perf",
  "docs",
  "qa",
  "triager",
  "community",
  "release",
] as const;

export type BoundedProfileKey = (typeof BOUNDED_PROFILE_KEYS)[number];

export const DEFAULT_SPAWN_MATRIX: Record<string, BoundedProfileKey[]> = {
  fake: ["fixer"],
  sonar: ["fixer", "security"],
  ci_failure: ["fixer", "engineer"],
  sentry: ["fixer"],
  datadog: ["fixer"],
  jira: ["engineer", "proposer"],
  linear: ["engineer", "proposer"],
  github_issue: ["engineer", "proposer"],
  vision_replan: ["proposer", "engineer"],
  maintainer: ["engineer", "reviewer"],
  product_gap: ["proposer", "engineer"],
  ux_audit: ["qa", "engineer"],
  seo_audit: ["docs", "engineer"],
  landing_audit: ["engineer", "docs"],
  reliability: ["fixer", "reviewer"],
  azure_boards: ["engineer"],
  asana: ["engineer"],
  clickup: ["engineer"],
  circleci: ["fixer"],
  buildkite: ["fixer"],
  jenkins: ["fixer"],
  bitbucket: ["fixer"],
  azure_devops: ["fixer"],
  codeql: ["security", "fixer"],
  semgrep: ["security", "fixer"],
  dependabot: ["security"],
  trivy: ["security", "fixer"],
  pagerduty: ["fixer"],
  opsgenie: ["fixer"],
  bugsnag: ["fixer"],
  "*": ["fixer", "engineer"],
};

export function isBoundedProfileKey(key: string): key is BoundedProfileKey {
  return (BOUNDED_PROFILE_KEYS as readonly string[]).includes(key);
}

export function resolveSpawnProfiles(
  provider: string,
  override?: string[] | null,
): BoundedProfileKey[] {
  if (override && override.length > 0) {
    const filtered = override.filter(isBoundedProfileKey);
    if (filtered.length > 0) return filtered;
  }
  return DEFAULT_SPAWN_MATRIX[provider] ?? DEFAULT_SPAWN_MATRIX["*"]!;
}

export type ProfileSeed = {
  key: BoundedProfileKey;
  displayName: string;
  promptGuidance: string;
  toolAllowlist: string[];
  strategyDefault: "balanced" | "blitz" | "fortress";
  maxSpendMicros: number;
};

export const PROFILE_CATALOG: ProfileSeed[] = [
  {
    key: "fixer",
    displayName: "Fixer",
    promptGuidance:
      "Fix the reported bug or failure with focused blast radius and a regression test that proves the fix.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 500_000,
  },
  {
    key: "engineer",
    displayName: "Engineer",
    promptGuidance:
      "Ship the acceptance criteria as a user-visible product increment with tests and docs when needed. For Go prefer go test ./.... Refuse scaffold stubs, typos, and empty structure PRs.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 2_000_000,
  },
  {
    key: "proposer",
    displayName: "Proposer",
    promptGuidance:
      "Select the next product increment from the vision or architecture Open IDs (P-/W-/A-/S-). Prefer capabilities with tests over bugs/docs-only. Output a scoped ship task, not a rewrite or typo.",
    toolAllowlist: ["read", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 500_000,
  },
  {
    key: "reviewer",
    displayName: "Reviewer",
    promptGuidance:
      "Adversarial review: reject scope creep, missing tests, unsafe changes, and path-allowlist violations. Prefer fail-closed judgments with concrete fix notes.",
    toolAllowlist: ["read", "test", "git"],
    strategyDefault: "fortress",
    maxSpendMicros: 60_000,
  },
  {
    key: "security",
    displayName: "Security",
    promptGuidance:
      "Remediate the vulnerability or SAST finding without weakening auth or expanding attack surface.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "fortress",
    maxSpendMicros: 100_000,
  },
  {
    key: "perf",
    displayName: "Perf",
    promptGuidance:
      "Improve performance within budget; measure before/after; avoid premature abstraction.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 100_000,
  },
  {
    key: "docs",
    displayName: "Docs",
    promptGuidance:
      "Update docs/OpenAPI/README to match code changes. Do not change runtime behavior.",
    toolAllowlist: ["read", "edit", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 40_000,
  },
  {
    key: "qa",
    displayName: "QA",
    promptGuidance:
      "Add or fix tests that catch the reported failure. Prefer deterministic assertions.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "fortress",
    maxSpendMicros: 60_000,
  },
  {
    key: "triager",
    displayName: "Triager",
    promptGuidance:
      "Triage issues and signals: severity, duplicate, effort band, labels. Prefer actionable next steps; do not expand scope.",
    toolAllowlist: ["read", "git"],
    strategyDefault: "blitz",
    maxSpendMicros: 40_000,
  },
  {
    key: "community",
    displayName: "Community",
    promptGuidance:
      "Reply helpfully on GitHub issues/Discussions. Stay on-topic, never share secrets, escalate security reports.",
    toolAllowlist: ["read"],
    strategyDefault: "balanced",
    maxSpendMicros: 30_000,
  },
  {
    key: "release",
    displayName: "Release",
    promptGuidance:
      "Prepare changelog and release notes from merged work. Do not change runtime behavior outside version bump files.",
    toolAllowlist: ["read", "edit", "git"],
    strategyDefault: "fortress",
    maxSpendMicros: 50_000,
  },
];
