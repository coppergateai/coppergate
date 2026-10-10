import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import { markInstallationRemoved } from "./github.js";
import { projects, workspaces, type Project, type Workspace } from "./schema.js";

/** Soft-deleted workspaces are hard-purged after this retention window. */
export const WORKSPACE_PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export class DeletionError extends Error {
  readonly code: "not_found" | "forbidden" | "conflict";
  constructor(code: DeletionError["code"], message: string) {
    super(message);
    this.name = "DeletionError";
    this.code = code;
  }
}

/**
 * Purge sealed GitHub credentials for a workspace (immediate on soft-delete).
 * Leaves installation row marked removed for auditability until hard purge.
 */
export async function purgeWorkspaceCredentials(
  db: Database,
  workspaceId: string,
  actor: string,
): Promise<{ purged: boolean }> {
  const removed = await markInstallationRemoved(db, workspaceId);
  await recordAuditEvent(db, {
    workspaceId,
    actor,
    action: "credentials.purged",
    targetType: "workspace",
    targetId: workspaceId,
    meta: { hadInstallation: Boolean(removed) },
  });
  return { purged: Boolean(removed) };
}

/**
 * Soft-delete a workspace: hide from APIs, purge tokens immediately, audit.
 * Row retained until purgeExpiredSoftDeletedWorkspaces (30 days).
 */
export async function softDeleteWorkspace(
  db: Database,
  input: { workspaceId: string; actor: string },
): Promise<Workspace> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!existing) {
    throw new DeletionError("not_found", "Workspace not found");
  }
  if (existing.status === "deleted") {
    throw new DeletionError("conflict", "Workspace already deleted");
  }

  await purgeWorkspaceCredentials(db, input.workspaceId, input.actor);

  const freedSlug = `${existing.slug}-deleted-${existing.id.slice(0, 8)}`;
  const [row] = await db
    .update(workspaces)
    .set({
      status: "deleted",
      deletedAt: now,
      slug: freedSlug.slice(0, 80),
      updatedAt: now,
    })
    .where(
      and(
        eq(workspaces.id, input.workspaceId),
        ne(workspaces.status, "deleted"),
      ),
    )
    .returning();

  if (!row) {
    throw new DeletionError("conflict", "Workspace already deleted");
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "workspace.deleted",
    targetType: "workspace",
    targetId: input.workspaceId,
    meta: { previousSlug: existing.slug },
  });

  return row;
}

/** Soft-delete / archive a project within a workspace. */
export async function archiveProject(
  db: Database,
  input: { workspaceId: string; projectId: string; actor: string },
): Promise<Project> {
  const now = new Date();
  const [row] = await db
    .update(projects)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
        ne(projects.status, "archived"),
      ),
    )
    .returning();

  if (!row) {
    throw new DeletionError("not_found", "Project not found");
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "project.archived",
    targetType: "project",
    targetId: input.projectId,
    meta: { name: row.name },
  });

  return row;
}

/**
 * Hard-delete soft-deleted workspaces past the retention window.
 * Cascade removes memberships, projects, runs, etc. Credentials already purged
 * at soft-delete time.
 */
export async function purgeExpiredSoftDeletedWorkspaces(
  db: Database,
  options?: { now?: Date; retentionMs?: number },
): Promise<{ purged: number; workspaceIds: string[] }> {
  const now = options?.now ?? new Date();
  const retentionMs = options?.retentionMs ?? WORKSPACE_PURGE_AFTER_MS;
  const cutoff = new Date(now.getTime() - retentionMs);

  const expired = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.status, "deleted"),
        isNotNull(workspaces.deletedAt),
        lt(workspaces.deletedAt, cutoff),
      ),
    );

  const workspaceIds: string[] = [];
  for (const row of expired) {
    // Re-purge credentials in case soft-delete raced or was partial.
    await purgeWorkspaceCredentials(db, row.id, "system:purge-job");
    await db.delete(workspaces).where(eq(workspaces.id, row.id));
    workspaceIds.push(row.id);
  }

  return { purged: workspaceIds.length, workspaceIds };
}
