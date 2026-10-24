import type { Database } from "./client.js";
import { consumedSignedStates } from "./schema.js";

export type ConsumeSignedStateInput = {
  /** Opaque single-use id (nonce / jti). */
  jti: string;
  /** e.g. github_install */
  kind: string;
  workspaceId?: string | null;
  expiresAt: Date;
};

/**
 * Atomically mark a signed state as consumed.
 * Returns true on first use; false on replay (unique jti conflict).
 */
export async function tryConsumeSignedState(
  db: Database,
  input: ConsumeSignedStateInput,
): Promise<boolean> {
  const jti = input.jti.trim();
  if (!jti) return false;

  try {
    const [row] = await db
      .insert(consumedSignedStates)
      .values({
        jti,
        kind: input.kind,
        workspaceId: input.workspaceId ?? null,
        consumedAt: new Date(),
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing()
      .returning({ jti: consumedSignedStates.jti });
    return Boolean(row);
  } catch {
    // Unique violation race or missing table in older envs — fail closed.
    return false;
  }
}
