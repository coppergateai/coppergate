import { eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { users, type User } from "./schema.js";

export type UpsertGithubUserInput = {
  githubUserId: string;
  login: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

export async function upsertGithubUser(
  db: Database,
  input: UpsertGithubUserInput,
): Promise<User> {
  const now = new Date();
  const id = crypto.randomUUID();

  const [row] = await db
    .insert(users)
    .values({
      id,
      githubUserId: input.githubUserId,
      login: input.login,
      email: input.email ?? null,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.githubUserId,
      set: {
        login: input.login,
        email: input.email ?? null,
        name: input.name ?? null,
        avatarUrl: input.avatarUrl ?? null,
        lastLoginAt: now,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to upsert user");
  }
  return row;
}

export async function getUserById(
  db: Database,
  userId: string,
): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}
