import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  projects,
  type AutonomyLevel,
  type Project,
} from "./schema.js";

export async function setProjectAutonomyLevel(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    autonomyLevel: AutonomyLevel;
    actor: string;
  },
): Promise<Project> {
  const [updated] = await db
    .update(projects)
    .set({
      autonomyLevel: input.autonomyLevel,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!updated) {
    throw new Error("project not found");
  }
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "project.autonomy",
    targetType: "project",
    targetId: input.projectId,
    meta: { autonomyLevel: input.autonomyLevel },
  });
  return updated;
}

export async function setProjectMergeEnabled(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    mergeEnabled: boolean;
    actor: string;
  },
): Promise<Project> {
  const [updated] = await db
    .update(projects)
    .set({
      mergeEnabled: input.mergeEnabled,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!updated) {
    throw new Error("project not found");
  }
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "project.merge_enabled",
    targetType: "project",
    targetId: input.projectId,
    meta: { mergeEnabled: input.mergeEnabled },
  });
  return updated;
}
