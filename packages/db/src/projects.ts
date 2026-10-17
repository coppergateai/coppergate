import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  assertSecondaryRepoAllowed,
  parseMultiRepoPolicyJson,
  resolveMultiRepoPolicy,
  serializeMultiRepoPolicy,
  type MultiRepoPolicy,
} from "./multi-repo.js";
import {
  githubInstallations,
  projects,
  repositoryConnections,
  type AutonomyLevel,
  type Project,
  type ProjectMode,
  type ProjectStack,
  type RepositoryConnection,
} from "./schema.js";

export class ProjectBindError extends Error {
  readonly code:
    | "not_found"
    | "wrong_workspace"
    | "install_inactive"
    | "repo_already_bound"
    | "invalid_mode"
    | "multi_repo_disabled"
    | "max_secondary_repos"
    | "cannot_detach_primary"
    | "policy_denied";

  constructor(code: ProjectBindError["code"], message: string) {
    super(message);
    this.name = "ProjectBindError";
    this.code = code;
  }
}

export type CreateProjectInput = {
  workspaceId: string;
  name: string;
  mode: ProjectMode;
  repositoryConnectionId: string;
  autonomyLevel?: AutonomyLevel;
  /**
   * Detected stack label. For `new_product` defaults to `nextjs_ts`.
   * For `existing_repo` defaults to `unknown` when omitted.
   */
  stack?: string;
  /** Optional detection metadata for compatibility JSON. */
  stackDetection?: {
    source: string;
    detail: string;
  };
};

export type ProjectWithRepo = {
  project: Project;
  repository: RepositoryConnection;
};

/** Default template stack for new_product projects. */
export const MVP_STACK: ProjectStack = "nextjs_ts";

export function resolveProjectStack(
  mode: ProjectMode,
  stack?: string,
): string {
  const trimmed = stack?.trim();
  if (trimmed) return trimmed;
  return mode === "new_product" ? MVP_STACK : "unknown";
}

export function buildCompatibility(
  mode: ProjectMode,
  repo: RepositoryConnection,
  stack: string,
  detection?: { source: string; detail: string },
): string {
  const checkedAt = new Date().toISOString();
  if (mode === "new_product") {
    return JSON.stringify({
      mode,
      stack,
      template: "nextjs_ts",
      repo: repo.baseRepoFullName,
      checkedAt,
      ok: true,
    });
  }
  return JSON.stringify({
    mode,
    stack,
    repo: repo.baseRepoFullName,
    defaultBranch: repo.defaultBranch,
    checks: [
      {
        id: "stack_detect",
        status: detection?.source === "unknown" ? "unknown" : "ok",
        detail: detection
          ? `${detection.source}: ${detection.detail}`
          : `stack=${stack}`,
      },
      { id: "default_branch", status: "ok", detail: repo.defaultBranch },
    ],
    checkedAt,
    ok: true,
  });
}

/**
 * Create a project and bind exactly one repository connection.
 * Fails if install is not active or the connection is already bound.
 */
export async function createProjectWithRepo(
  db: Database,
  input: CreateProjectInput,
): Promise<ProjectWithRepo> {
  const name = input.name.trim();
  if (!name) {
    throw new ProjectBindError("invalid_mode", "Project name is required");
  }
  if (input.mode !== "new_product" && input.mode !== "existing_repo") {
    throw new ProjectBindError("invalid_mode", "Invalid project mode");
  }

  return db.transaction(async (tx) => {
    const [conn] = await tx
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.id, input.repositoryConnectionId))
      .limit(1);

    if (!conn) {
      throw new ProjectBindError("not_found", "Repository connection not found");
    }
    if (conn.workspaceId !== input.workspaceId) {
      throw new ProjectBindError(
        "wrong_workspace",
        "Repository connection not in workspace",
      );
    }
    if (conn.projectId) {
      throw new ProjectBindError(
        "repo_already_bound",
        "Repository is already bound to a project",
      );
    }
    if (conn.installationStatus !== "active") {
      throw new ProjectBindError(
        "install_inactive",
        "Repository connection is not active",
      );
    }

    const [installation] = await tx
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.id, conn.installationId))
      .limit(1);

    if (!installation || installation.status !== "active") {
      throw new ProjectBindError(
        "install_inactive",
        "GitHub App installation is not active",
      );
    }

    const now = new Date();
    const projectId = crypto.randomUUID();
    const stack = resolveProjectStack(input.mode, input.stack);
    const compatibility = buildCompatibility(
      input.mode,
      conn,
      stack,
      input.stackDetection,
    );

    const [project] = await tx
      .insert(projects)
      .values({
        id: projectId,
        workspaceId: input.workspaceId,
        name,
        mode: input.mode,
        status: "draft",
        stack,
        autonomyLevel: input.autonomyLevel ?? "L0",
        maxBudgetMicros: 0,
        spentMicros: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!project) {
      throw new Error("Failed to create project");
    }

    const [bound] = await tx
      .update(repositoryConnections)
      .set({
        projectId,
        repoRole: "primary",
        compatibility,
        updatedAt: now,
      })
      .where(
        and(
          eq(repositoryConnections.id, conn.id),
          isNull(repositoryConnections.projectId),
        ),
      )
      .returning();

    if (!bound) {
      throw new ProjectBindError(
        "repo_already_bound",
        "Repository is already bound to a project",
      );
    }

    return { project, repository: bound };
  });
}

const primaryRepoJoin = and(
  eq(repositoryConnections.projectId, projects.id),
  eq(repositoryConnections.repoRole, "primary"),
);

export async function listProjectsForWorkspace(
  db: Database,
  workspaceId: string,
): Promise<ProjectWithRepo[]> {
  const rows = await db
    .select({
      project: projects,
      repository: repositoryConnections,
    })
    .from(projects)
    .innerJoin(repositoryConnections, primaryRepoJoin)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        ne(projects.status, "archived"),
      ),
    );

  return rows.map((r) => ({
    project: r.project,
    repository: r.repository,
  }));
}

export async function getProjectForWorkspace(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProjectWithRepo | undefined> {
  const rows = await db
    .select({
      project: projects,
      repository: repositoryConnections,
    })
    .from(projects)
    .innerJoin(repositoryConnections, primaryRepoJoin)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return { project: row.project, repository: row.repository };
}

export async function listReposForProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<RepositoryConnection[]> {
  const project = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!project[0]) return [];

  return db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
}

export function getProjectMultiRepoPolicy(project: Project): MultiRepoPolicy {
  return parseMultiRepoPolicyJson(project.multiRepoPolicy);
}

export async function setProjectMultiRepoPolicy(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    policy: Partial<MultiRepoPolicy>;
  },
): Promise<Project> {
  const bound = await getProjectForWorkspace(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!bound) {
    throw new ProjectBindError("not_found", "Project not found");
  }
  const next = serializeMultiRepoPolicy(
    resolveMergedPolicy(bound.project, input.policy),
  );
  const [updated] = await db
    .update(projects)
    .set({ multiRepoPolicy: next, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!updated) {
    throw new ProjectBindError("not_found", "Project not found");
  }
  return updated;
}

function resolveMergedPolicy(
  project: Project,
  patch: Partial<MultiRepoPolicy>,
): MultiRepoPolicy {
  const current = parseMultiRepoPolicyJson(project.multiRepoPolicy);
  return resolveMultiRepoPolicy({
    enabled: patch.enabled ?? current.enabled,
    maxSecondaryRepos: patch.maxSecondaryRepos ?? current.maxSecondaryRepos,
    maxSecondaryFiles: patch.maxSecondaryFiles ?? current.maxSecondaryFiles,
    coordinatedPrs: patch.coordinatedPrs ?? current.coordinatedPrs,
  });
}

/**
 * Attach an unbound workspace repo as secondary under a project.
 * Requires multi-repo policy enabled on the project.
 */
export async function attachSecondaryRepo(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    repositoryConnectionId: string;
  },
): Promise<RepositoryConnection> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!project) {
      throw new ProjectBindError("not_found", "Project not found");
    }

    const policy = parseMultiRepoPolicyJson(project.multiRepoPolicy);
    const existing = await tx
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, input.projectId));
    const secondaryCount =
      existing.filter((r) => r.repoRole === "secondary").length + 1;
    const gate = assertSecondaryRepoAllowed(policy, {
      secondaryCount,
      filesTouched: 0,
    });
    if (!gate.ok) {
      throw new ProjectBindError(
        gate.reason === "multi_repo_disabled"
          ? "multi_repo_disabled"
          : gate.reason === "max_secondary_repos"
            ? "max_secondary_repos"
            : "policy_denied",
        gate.reason === "multi_repo_disabled"
          ? "Enable multi-repo policy before attaching secondary repos"
          : gate.reason === "max_secondary_repos"
            ? "Secondary repo limit reached"
            : `Secondary attach denied: ${gate.reason}`,
      );
    }

    const [conn] = await tx
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.id, input.repositoryConnectionId))
      .limit(1);
    if (!conn) {
      throw new ProjectBindError("not_found", "Repository connection not found");
    }
    if (conn.workspaceId !== input.workspaceId) {
      throw new ProjectBindError(
        "wrong_workspace",
        "Repository connection not in workspace",
      );
    }
    if (conn.projectId) {
      throw new ProjectBindError(
        "repo_already_bound",
        "Repository is already bound to a project",
      );
    }
    if (conn.installationStatus !== "active") {
      throw new ProjectBindError(
        "install_inactive",
        "Repository connection is not active",
      );
    }

    const now = new Date();
    const [bound] = await tx
      .update(repositoryConnections)
      .set({
        projectId: input.projectId,
        repoRole: "secondary",
        updatedAt: now,
      })
      .where(
        and(
          eq(repositoryConnections.id, conn.id),
          isNull(repositoryConnections.projectId),
        ),
      )
      .returning();
    if (!bound) {
      throw new ProjectBindError(
        "repo_already_bound",
        "Repository is already bound to a project",
      );
    }
    return bound;
  });
}

/** Detach a secondary repo from a project (unbind; does not delete connection). */
export async function detachSecondaryRepo(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    repositoryConnectionId: string;
  },
): Promise<RepositoryConnection> {
  const [conn] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.id, input.repositoryConnectionId))
    .limit(1);
  if (!conn || conn.workspaceId !== input.workspaceId) {
    throw new ProjectBindError("not_found", "Repository connection not found");
  }
  if (conn.projectId !== input.projectId) {
    throw new ProjectBindError(
      "wrong_workspace",
      "Repository is not bound to this project",
    );
  }
  if (conn.repoRole === "primary") {
    throw new ProjectBindError(
      "cannot_detach_primary",
      "Cannot detach the primary repo — promote another first",
    );
  }

  const [updated] = await db
    .update(repositoryConnections)
    .set({
      projectId: null,
      repoRole: "primary",
      updatedAt: new Date(),
    })
    .where(eq(repositoryConnections.id, conn.id))
    .returning();
  if (!updated) {
    throw new ProjectBindError("not_found", "Repository connection not found");
  }
  return updated;
}

/**
 * Promote a secondary to primary; demote previous primary to secondary.
 */
export async function promotePrimaryRepo(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    repositoryConnectionId: string;
  },
): Promise<{ primary: RepositoryConnection; previous: RepositoryConnection }> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!project) {
      throw new ProjectBindError("not_found", "Project not found");
    }

    const [next] = await tx
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.id, input.repositoryConnectionId))
      .limit(1);
    if (!next || next.projectId !== input.projectId) {
      throw new ProjectBindError(
        "not_found",
        "Repository is not bound to this project",
      );
    }
    if (next.repoRole === "primary") {
      return { primary: next, previous: next };
    }

    const [currentPrimary] = await tx
      .select()
      .from(repositoryConnections)
      .where(
        and(
          eq(repositoryConnections.projectId, input.projectId),
          eq(repositoryConnections.repoRole, "primary"),
        ),
      )
      .limit(1);
    if (!currentPrimary) {
      throw new ProjectBindError("not_found", "No primary repo on project");
    }

    const now = new Date();
    // Temporarily clear unique primary constraint by demoting first.
    const [demoted] = await tx
      .update(repositoryConnections)
      .set({ repoRole: "secondary", updatedAt: now })
      .where(eq(repositoryConnections.id, currentPrimary.id))
      .returning();
    const [promoted] = await tx
      .update(repositoryConnections)
      .set({ repoRole: "primary", updatedAt: now })
      .where(eq(repositoryConnections.id, next.id))
      .returning();
    if (!demoted || !promoted) {
      throw new ProjectBindError("not_found", "Failed to promote primary");
    }
    return { primary: promoted, previous: demoted };
  });
}

export type UpdateProjectStackInput = {
  workspaceId: string;
  projectId: string;
  stack: string;
  stackDetection?: { source: string; detail: string };
};

/** Update project stack + repository compatibility after re-detection. */
export async function updateProjectStack(
  db: Database,
  input: UpdateProjectStackInput,
): Promise<ProjectWithRepo | undefined> {
  const stack = input.stack.trim() || "unknown";
  const now = new Date();

  return db.transaction(async (tx) => {
    const [project] = await tx
      .update(projects)
      .set({ stack, updatedAt: now })
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, input.workspaceId),
        ),
      )
      .returning();

    if (!project) return undefined;

    const [conn] = await tx
      .select()
      .from(repositoryConnections)
      .where(
        and(
          eq(repositoryConnections.projectId, project.id),
          eq(repositoryConnections.repoRole, "primary"),
        ),
      )
      .limit(1);

    if (!conn) return undefined;

    const compatibility = buildCompatibility(
      project.mode as ProjectMode,
      conn,
      stack,
      input.stackDetection,
    );

    const [repository] = await tx
      .update(repositoryConnections)
      .set({ compatibility, updatedAt: now })
      .where(eq(repositoryConnections.id, conn.id))
      .returning();

    return { project, repository: repository ?? conn };
  });
}
