import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { users, type AuthProvider, type User } from "./schema.js";

export type UpsertScmUserInput = {
  authProvider: AuthProvider;
  /** Provider-stable external user id. */
  externalUserId: string;
  login: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

/** @deprecated Prefer upsertScmUser — kept for GitHub call sites. */
export type UpsertGithubUserInput = {
  githubUserId: string;
  login: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

export async function upsertScmUser(
  db: Database,
  input: UpsertScmUserInput,
): Promise<User> {
  const now = new Date();
  const id = crypto.randomUUID();

  const existing = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.authProvider, input.authProvider),
        eq(users.githubUserId, input.externalUserId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(users)
      .set({
        login: input.login,
        email: input.email ?? null,
        name: input.name ?? null,
        avatarUrl: input.avatarUrl ?? null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    if (!row) throw new Error("Failed to update user");
    return row;
  }

  const [row] = await db
    .insert(users)
    .values({
      id,
      authProvider: input.authProvider,
      githubUserId: input.externalUserId,
      login: input.login,
      email: input.email ?? null,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to upsert user");
  }
  return row;
}

export async function upsertGithubUser(
  db: Database,
  input: UpsertGithubUserInput,
): Promise<User> {
  return upsertScmUser(db, {
    authProvider: "github",
    externalUserId: input.githubUserId,
    login: input.login,
    email: input.email,
    name: input.name,
    avatarUrl: input.avatarUrl,
  });
}

export async function getUserById(
  db: Database,
  userId: string,
): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}
