/**
 * TASK121 — multi-repo project policy (default off).
 * Secondary repos are read-only until explicitly enabled with blast-radius caps.
 */

export type MultiRepoPolicy = {
  enabled: boolean;
  /** Max secondary repos bindable to a project. */
  maxSecondaryRepos: number;
  /** Max files touched across secondary repos per arena. */
  maxSecondaryFiles: number;
  /** Allow coordinated PRs (default false). */
  coordinatedPrs: boolean;
};

export const DEFAULT_MULTI_REPO_POLICY: MultiRepoPolicy = {
  enabled: false,
  maxSecondaryRepos: 2,
  maxSecondaryFiles: 20,
  coordinatedPrs: false,
};

export function resolveMultiRepoPolicy(
  override?: Partial<MultiRepoPolicy> | null,
): MultiRepoPolicy {
  if (!override) return { ...DEFAULT_MULTI_REPO_POLICY };
  return {
    enabled: override.enabled === true,
    maxSecondaryRepos: Math.min(
      override.maxSecondaryRepos ?? DEFAULT_MULTI_REPO_POLICY.maxSecondaryRepos,
      5,
    ),
    maxSecondaryFiles: Math.min(
      override.maxSecondaryFiles ?? DEFAULT_MULTI_REPO_POLICY.maxSecondaryFiles,
      100,
    ),
    coordinatedPrs:
      override.enabled === true && override.coordinatedPrs === true,
  };
}

/** Parse projects.multi_repo_policy JSON (null/invalid → defaults). */
export function parseMultiRepoPolicyJson(
  raw: string | null | undefined,
): MultiRepoPolicy {
  if (!raw?.trim()) return resolveMultiRepoPolicy(null);
  try {
    const parsed = JSON.parse(raw) as Partial<MultiRepoPolicy>;
    return resolveMultiRepoPolicy(parsed);
  } catch {
    return resolveMultiRepoPolicy(null);
  }
}

export function serializeMultiRepoPolicy(policy: MultiRepoPolicy): string {
  return JSON.stringify(resolveMultiRepoPolicy(policy));
}

export function assertSecondaryRepoAllowed(
  policy: MultiRepoPolicy,
  input: { secondaryCount: number; filesTouched: number },
): { ok: true } | { ok: false; reason: string } {
  if (!policy.enabled) {
    return { ok: false, reason: "multi_repo_disabled" };
  }
  if (input.secondaryCount > policy.maxSecondaryRepos) {
    return { ok: false, reason: "max_secondary_repos" };
  }
  if (input.filesTouched > policy.maxSecondaryFiles) {
    return { ok: false, reason: "max_secondary_files" };
  }
  return { ok: true };
}

export type RepoRole = "primary" | "secondary";

export function isRepoRole(value: unknown): value is RepoRole {
  return value === "primary" || value === "secondary";
}
