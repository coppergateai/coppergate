/**
 * P-143 — honest copy + effective flags for L2 merge, min_human, and maintainer mode.
 * PRODUCT §11: maintainer ON ≠ production deploy; kill-switch + envelope stay fail-closed.
 */

/** Arena column default after G1b (drizzle 0019). Matches ensureArenaForProject insert default. */
export const DEFAULT_ARENA_MIN_HUMAN = true;

/** Stored null/undefined means “not created yet” — effective default is on. */
export function effectiveArenaMinHuman(
  stored: boolean | null | undefined,
): boolean {
  if (stored === null || stored === undefined) return DEFAULT_ARENA_MIN_HUMAN;
  return stored;
}

export type L2AutoMergeInputs = {
  autonomyLevel: string;
  mergeEnabled: boolean;
  maintainerEnabled?: boolean;
  maintainerAutoMerge?: boolean;
};

export type L2AutoMergeHonesty = {
  /** Merge on human Accept when gates pass (TASK043). */
  acceptPathActive: boolean;
  /** Unattended merge on maintainer tick (L2 + merge + policy.autoMerge). */
  maintainerPathActive: boolean;
  blockers: string[];
  acceptSummary: string;
  maintainerSummary: string;
};

export function describeL2AutoMerge(
  input: L2AutoMergeInputs,
): L2AutoMergeHonesty {
  const isL2 = input.autonomyLevel === "L2";
  const blockers: string[] = [];

  if (!isL2) {
    blockers.push("Autonomy is not L2");
  }
  if (!input.mergeEnabled) {
    blockers.push("Merge after accept is off");
  }

  const acceptPathActive = isL2 && input.mergeEnabled;

  let maintainerPathActive = false;
  if (!input.maintainerEnabled) {
    blockers.push("Maintainer mode is off (unattended merge only runs there)");
  } else if (input.maintainerAutoMerge === false) {
    blockers.push("Maintainer policy has auto-merge off");
  } else if (acceptPathActive) {
    maintainerPathActive = true;
  }

  const acceptSummary = acceptPathActive
    ? "Active on Accept — merges the PR after you accept Evidence when CI/fitness gates pass."
    : "Inactive — turn on L2 autonomy and Merge after accept.";

  const maintainerSummary = maintainerPathActive
    ? "Active on maintainer ticks — merges green PRs without another Accept click."
    : acceptPathActive
      ? "Accept-path merge only — enable maintainer (and policy auto-merge) for unattended merges."
      : "Inactive — requires L2, merge opt-in, maintainer on, and maintainer auto-merge.";

  return {
    acceptPathActive,
    maintainerPathActive,
    blockers,
    acceptSummary,
    maintainerSummary,
  };
}

export type MinHumanHonesty = {
  effective: boolean;
  stored: boolean | null;
  summary: string;
};

export function describeMinHumanHonesty(
  stored: boolean | null | undefined,
): MinHumanHonesty {
  const effective = effectiveArenaMinHuman(stored);
  const hasRow = stored !== null && stored !== undefined;
  const summary = effective
    ? hasRow
      ? "On — DRAFT tasks skip the inbox and queue when submitted."
      : "On by default — will apply when Arena is first armed (no row yet)."
    : hasRow
      ? "Off — submit stops at READY_FOR_APPROVAL until you approve in Inbox."
      : "Off — explicit override when Arena exists.";
  return {
    effective,
    stored: hasRow ? stored! : null,
    summary,
  };
}

export type MaintainerSettingsHonesty = {
  enabledLabel: string;
  notProdDeployLine: string;
  failClosedLines: string[];
};

export type ReleaseAssistantHonesty = {
  /** Effective auto-release when maintainer policy is applied. */
  releasePathActive: boolean;
  blockers: string[];
  summary: string;
  notProdDeployLine: string;
  auditLine: string;
};

/**
 * P-144 — L3 Release Assistant: GitHub tag + Release on maintainer tick when
 * policy.autoRelease is on. Never implies production deploy or prod_writes.
 */
export function describeReleaseAssistantHonesty(input: {
  maintainerEnabled: boolean;
  autoRelease?: boolean;
  prodWritesEnabled?: boolean;
}): ReleaseAssistantHonesty {
  const autoRelease = input.autoRelease === true;
  const blockers: string[] = [];
  if (!input.maintainerEnabled) {
    blockers.push("Maintainer mode is off");
  }
  if (!autoRelease) {
    blockers.push("Maintainer policy has auto-release off");
  }
  const releasePathActive =
    input.maintainerEnabled && autoRelease && blockers.length === 0;

  const summary = releasePathActive
    ? "Active on maintainer ticks — after unattended merges, opens a GitHub tag + Release with notes from merged work."
    : input.maintainerEnabled && !autoRelease
      ? "Inactive — turn on auto-release in maintainer policy to ship GitHub Releases after merge cycles."
      : "Inactive — requires maintainer on and policy auto-release.";

  const prodWrites = input.prodWritesEnabled === true;
  return {
    releasePathActive,
    blockers,
    summary,
    notProdDeployLine: prodWrites
      ? "Arena prod writes may be on — releases still do not deploy to production."
      : "Does not deploy to production or enable prod environment writes — GitHub Release only.",
    auditLine:
      "Each release writes maintainer.release to Activity (tag, URL, merge highlights; prodDeploy: false).",
  };
}

/** Clarifies maintainer scope vs production deploy (PRODUCT §11 non-goals). */
export function describeMaintainerSettingsHonesty(input: {
  maintainerEnabled: boolean;
  prodWritesEnabled?: boolean;
}): MaintainerSettingsHonesty {
  const prodWrites = input.prodWritesEnabled === true;
  return {
    enabledLabel: input.maintainerEnabled
      ? "Maintainer schedules backlog work under your envelope — not unattended production deploy."
      : "Maintainer off — you drive Accept and merge unless L2 merge on Accept is enabled.",
    notProdDeployLine: prodWrites
      ? "Arena prod writes are enabled — still policy-gated; this is not a hosted production deploy button."
      : "Does not enable production deploy or prod environment writes — PR merges stay fitness- and policy-gated.",
    failClosedLines: [
      "Kill-switch still cancels in-flight contenders and freezes enqueue.",
      "Monthly spend envelope still hard-pauses when cap is hit (fail-closed).",
      "Branch protection and required CI are never bypassed.",
    ],
  };
}
