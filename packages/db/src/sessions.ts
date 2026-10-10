import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Database } from "./client.js";
import { sessions, users, type Session, type User } from "./schema.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  db: Database,
  userId: string,
): Promise<{ token: string; session: Session }> {
  const token = mintSessionToken();
  const now = new Date();
  const [session] = await db
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
    })
    .returning();

  if (!session) {
    throw new Error("Failed to create session");
  }
  return { token, session };
}

export async function findUserBySessionToken(
  db: Database,
  token: string,
): Promise<{ user: User; session: Session } | undefined> {
  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return row;
}

export async function deleteSessionByToken(
  db: Database,
  token: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)));
}
