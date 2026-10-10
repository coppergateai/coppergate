import {
  createSession,
  deleteSessionByToken,
  findUserBySessionToken,
  type Database,
  type User,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export async function establishSession(
  db: Database,
  userId: string,
): Promise<string> {
  const { token } = await createSession(db, userId);
  return token;
}

export async function resolveSessionUser(
  db: Database,
  token: string | undefined | null,
): Promise<User | null> {
  if (!token) return null;
  const found = await findUserBySessionToken(db, token);
  return found?.user ?? null;
}

export async function requireSessionUser(
  db: Database,
  token: string | undefined | null,
): Promise<User> {
  const user = await resolveSessionUser(db, token);
  if (!user) {
    throw new ApiError("unauthorized", "Authentication required");
  }
  return user;
}

export async function destroySession(
  db: Database,
  token: string | undefined | null,
): Promise<void> {
  if (!token) return;
  await deleteSessionByToken(db, token);
}
