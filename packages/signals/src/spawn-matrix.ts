/**
 * TASK102 — default signal → bounded role spawn matrix.
 * Agents cannot invent roles outside the catalog.
 */

export const BOUNDED_PROFILE_KEYS = [
  "fixer",
  "engineer",
  "security",
  "perf",
  "docs",
  "qa",
] as const;

export type BoundedProfileKey = (typeof BOUNDED_PROFILE_KEYS)[number];

export const DEFAULT_SPAWN_MATRIX: Record<string, BoundedProfileKey[]> = {
  fake: ["fixer"],
  sonar: ["fixer", "security"],
  ci_failure: ["fixer"],
  sentry: ["fixer"],
  datadog: ["fixer"],
  jira: ["engineer"],
  linear: ["engineer"],
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
  "*": ["fixer"],
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
      "Fix the reported bug or failure with minimal blast radius. Prefer tests that prove the fix.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "blitz",
    maxSpendMicros: 80_000,
  },
  {
    key: "engineer",
    displayName: "Engineer",
    promptGuidance:
      "Implement the feature or issue within scope and acceptance criteria. Keep diffs reviewable.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 120_000,
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
];
