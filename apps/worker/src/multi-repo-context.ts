import {
  assertSecondaryRepoAllowed,
  getProjectMultiRepoPolicy,
  listReposForProject,
  type Database,
  type MultiRepoPolicy,
  type Project,
  type RepositoryConnection,
} from "@coppergate/db";

export type SecondaryRepoContext = {
  id: string;
  fullName: string;
  defaultBranch: string;
  /** Read-only unless coordinatedPrs. */
  role: "secondary";
};

export type MultiRepoRunContext = {
  policy: MultiRepoPolicy;
  primary: RepositoryConnection | null;
  secondaries: SecondaryRepoContext[];
  /** Injected into agent architectureContext. */
  contextBlock: string;
  allowed: boolean;
  denyReason: string | null;
};

/**
 * Resolve multi-repo read context for a run. Fail-closed when policy off.
 * Does not clone — exposes secondary metadata for the agent + run events.
 */
export async function resolveMultiRepoRunContext(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    project: Project;
    /** Estimated files the agent may touch in secondaries (blast radius). */
    filesTouchedEstimate?: number;
  },
): Promise<MultiRepoRunContext> {
  const policy = getProjectMultiRepoPolicy(input.project);
  const repos = await listReposForProject(
    db,
    input.workspaceId,
    input.projectId,
  );
  const primary = repos.find((r) => r.repoRole === "primary") ?? null;
  const secondaryRows = repos.filter((r) => r.repoRole === "secondary");

  if (!policy.enabled) {
    return {
      policy,
      primary,
      secondaries: [],
      contextBlock: "",
      allowed: false,
      denyReason: "multi_repo_disabled",
    };
  }

  const gate = assertSecondaryRepoAllowed(policy, {
    secondaryCount: secondaryRows.length,
    filesTouched: input.filesTouchedEstimate ?? 0,
  });
  if (!gate.ok) {
    return {
      policy,
      primary,
      secondaries: [],
      contextBlock: "",
      allowed: false,
      denyReason: gate.reason,
    };
  }

  const secondaries: SecondaryRepoContext[] = secondaryRows.map((r) => ({
    id: r.id,
    fullName: r.baseRepoFullName,
    defaultBranch: r.defaultBranch,
    role: "secondary" as const,
  }));

  const lines = [
    "Multi-repo context (read-only unless coordinated PRs enabled):",
    `Primary write repo: ${primary?.baseRepoFullName ?? "(none)"}`,
    ...secondaries.map(
      (s) =>
        `- Secondary (read): ${s.fullName} @ ${s.defaultBranch}` +
        (policy.coordinatedPrs ? " — coordinated PR allowed" : ""),
    ),
    `Blast-radius cap: ${policy.maxSecondaryFiles} secondary files per arena.`,
  ];

  return {
    policy,
    primary,
    secondaries,
    contextBlock: secondaries.length > 0 ? lines.join("\n") : "",
    allowed: true,
    denyReason: null,
  };
}

export function mergeArchitectureContext(
  strategyContext: string | undefined,
  multiRepoBlock: string,
): string | undefined {
  const parts = [strategyContext?.trim(), multiRepoBlock.trim()].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
