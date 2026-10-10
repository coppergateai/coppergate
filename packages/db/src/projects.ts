import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "./client.js";
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
    | "invalid_mode";

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
};

export type ProjectWithRepo = {
  project: Project;
  repository: RepositoryConnection;
};

/** MVP stack for all new projects. */
export const MVP_STACK: ProjectStack = "nextjs_ts";

export function buildCompatibility(
  mode: ProjectMode,
  repo: RepositoryConnection,
): string {
  const checkedAt = new Date().toISOString();
  if (mode === "new_product") {
    return JSON.stringify({
      mode,
      stack: MVP_STACK,
      template: "nextjs_ts",
      repo: repo.baseRepoFullName,
      checkedAt,
      ok: true,
    });
  }
  return JSON.stringify({
    mode,
    stack: MVP_STACK,
    repo: repo.baseRepoFullName,
    defaultBranch: repo.defaultBranch,
    checks: [
      { id: "stack_hint", status: "assumed", detail: "MVP assumes nextjs_ts" },
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
    const compatibility = buildCompatibility(input.mode, conn);

    const [project] = await tx
      .insert(projects)
      .values({
        id: projectId,
        workspaceId: input.workspaceId,
        name,
        mode: input.mode,
        status: "draft",
        stack: MVP_STACK,
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
    .innerJoin(
      repositoryConnections,
      eq(repositoryConnections.projectId, projects.id),
    )
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
    .innerJoin(
      repositoryConnections,
      eq(repositoryConnections.projectId, projects.id),
    )
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
