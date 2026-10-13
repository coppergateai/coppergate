import { and, eq, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Database } from "./client.js";
import {
  memberships,
  users,
  workspaces,
  type AutonomyLevel,
  type Membership,
  type MembershipRole,
  type Workspace,
} from "./schema.js";
import { slugify, withSlugSuffix } from "./slug.js";

export type WorkspaceWithRole = {
  workspace: Workspace;
  role: MembershipRole;
};

export type CreateWorkspaceInput = {
  name: string;
  ownerUserId: string;
  autonomyDefault?: AutonomyLevel;
};

export type UpdateWorkspaceInput = {
  name?: string;
  autonomyDefault?: AutonomyLevel;
  notifyWebhookUrl?: string | null;
  notifyEmailEnabled?: boolean;
};

const AUTONOMY: ReadonlySet<string> = new Set(["L0", "L1", "L2"]);

export function isAutonomyLevel(value: string): value is AutonomyLevel {
  return AUTONOMY.has(value);
}

async function allocateSlug(db: Database, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate =
      attempt === 0
        ? base
        : withSlugSuffix(base, randomBytes(3).toString("hex"));
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1);
    if (!existing[0]) return candidate;
  }
  return withSlugSuffix(base, randomBytes(6).toString("hex"));
}

export async function createWorkspaceWithOwner(
  db: Database,
  input: CreateWorkspaceInput,
): Promise<WorkspaceWithRole> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Workspace name is required");
  }
  const autonomyDefault = input.autonomyDefault ?? "L0";
  if (!isAutonomyLevel(autonomyDefault)) {
    throw new Error("Invalid autonomy_default");
  }

  const slug = await allocateSlug(db, name);
  const now = new Date();
  const workspaceId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        id: workspaceId,
        name,
        slug,
        autonomyDefault,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!workspace) {
      throw new Error("Failed to create workspace");
    }

    const [membership] = await tx
      .insert(memberships)
      .values({
        id: membershipId,
        workspaceId,
        userId: input.ownerUserId,
        role: "owner",
        createdAt: now,
      })
      .returning();

    if (!membership) {
      throw new Error("Failed to create owner membership");
    }

    return { workspace, role: "owner" as const };
  });
}

export async function listWorkspacesForUser(
  db: Database,
  userId: string,
): Promise<WorkspaceWithRole[]> {
  const rows = await db
    .select({
      workspace: workspaces,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(
      and(eq(memberships.userId, userId), ne(workspaces.status, "deleted")),
    );

  return rows.map((row) => ({
    workspace: row.workspace,
    role: row.role as MembershipRole,
  }));
}

/**
 * Membership-scoped workspace lookup. Returns undefined when the user is not
 * a member or the workspace is deleted — callers must treat as not found (IDOR-safe).
 */
export async function getWorkspaceForMember(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceWithRole | undefined> {
  const rows = await db
    .select({
      workspace: workspaces,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
        ne(workspaces.status, "deleted"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return { workspace: row.workspace, role: row.role as MembershipRole };
}

export async function updateWorkspaceForOwner(
  db: Database,
  workspaceId: string,
  ownerUserId: string,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceWithRole | undefined> {
  const access = await getWorkspaceForMember(db, workspaceId, ownerUserId);
  if (!access) return undefined;
  if (access.role !== "owner") {
    return undefined;
  }

  const patch: Partial<typeof workspaces.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Workspace name is required");
    patch.name = name;
  }
  if (input.autonomyDefault !== undefined) {
    if (!isAutonomyLevel(input.autonomyDefault)) {
      throw new Error("Invalid autonomy_default");
    }
    patch.autonomyDefault = input.autonomyDefault;
  }
  if (input.notifyWebhookUrl !== undefined) {
    const url = input.notifyWebhookUrl?.trim() || null;
    if (url && !/^https:\/\//i.test(url)) {
      throw new Error("notifyWebhookUrl must be https");
    }
    patch.notifyWebhookUrl = url;
  }
  if (input.notifyEmailEnabled !== undefined) {
    patch.notifyEmailEnabled = input.notifyEmailEnabled;
  }

  const [workspace] = await db
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.id, workspaceId))
    .returning();

  if (!workspace) return undefined;
  return { workspace, role: "owner" };
}

/** Test helper — insert a bare user row. */
export async function insertTestUser(
  db: Database,
  overrides?: Partial<typeof users.$inferInsert>,
): Promise<typeof users.$inferSelect> {
  const now = new Date();
  const id = overrides?.id ?? crypto.randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      id,
      githubUserId: overrides?.githubUserId ?? `gh-${id}`,
      login: overrides?.login ?? `user-${id.slice(0, 8)}`,
      email: overrides?.email ?? null,
      name: overrides?.name ?? null,
      avatarUrl: overrides?.avatarUrl ?? null,
      lastLoginAt: overrides?.lastLoginAt ?? now,
      createdAt: overrides?.createdAt ?? now,
      updatedAt: overrides?.updatedAt ?? now,
    })
    .returning();
  if (!row) throw new Error("Failed to insert test user");
  return row;
}

export type { Membership, Workspace };
