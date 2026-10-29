/**
 * SEC-036 / PRODUCT §4 #8 — refuse merge-to-default and production deploy
 * unless an explicit workspace/project policy flag is set.
 */

export class ProdWritePolicyError extends Error {
  readonly code = "policy" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProdWritePolicyError";
  }
}

/** Explicit opt-in for merging a PR into the repository default branch. */
export function assertDefaultBranchMergeAllowed(input: {
  allowDefaultBranchWrite: boolean;
}): void {
  if (input.allowDefaultBranchWrite !== true) {
    throw new ProdWritePolicyError(
      "Refusing merge to default branch without explicit policy flag (mergeEnabled)",
    );
  }
}

/** Maintainer L3 — GitHub tag + Release (not hosted production deploy). */
export function assertReleaseAllowed(input: { allowRelease: boolean }): void {
  if (input.allowRelease !== true) {
    throw new ProdWritePolicyError(
      "Refusing GitHub release without explicit policy flag (autoRelease)",
    );
  }
}

/** Arena prod_writes_enabled — production / prod-environment deploy commands. */
export function assertProductionDeployAllowed(input: {
  prodWritesEnabled: boolean;
}): void {
  if (input.prodWritesEnabled !== true) {
    throw new ProdWritePolicyError(
      "Refusing production deploy without explicit policy flag (prodWritesEnabled)",
    );
  }
}

/**
 * Direct Contents API writes that target the default branch (branch omitted
 * or equal to defaultBranch).
 */
export function assertDefaultBranchContentsWriteAllowed(input: {
  allowDefaultBranchWrite: boolean;
  branch?: string;
  defaultBranch: string;
}): void {
  const def = input.defaultBranch.trim();
  const target = (input.branch?.trim() || def).trim();
  if (!def || target !== def) return;
  assertDefaultBranchMergeAllowed({
    allowDefaultBranchWrite: input.allowDefaultBranchWrite,
  });
}

/** Map project + maintainer settings to the merge gate flag (fail closed). */
export function resolveDefaultBranchMergeFlag(input: {
  mergeEnabled: boolean;
  via: "accept" | "maintainer";
  autonomyLevel?: string;
  maintainerAutoMerge?: boolean;
}): boolean {
  if (input.mergeEnabled !== true) return false;
  if (input.via === "accept") return input.autonomyLevel === "L2";
  if (input.via === "maintainer") return input.maintainerAutoMerge === true;
  return false;
}
