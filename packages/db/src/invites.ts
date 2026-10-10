import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import { pilotInvites, type PilotInvite } from "./schema.js";

export class InviteError extends Error {
  readonly code: "invalid" | "expired" | "exhausted" | "required";
  constructor(code: InviteError["code"], message: string) {
    super(message);
    this.name = "InviteError";
    this.code = code;
  }
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Create a one-time (or multi-use) pilot invite. */
export async function createPilotInvite(
  db: Database,
  input?: {
    code?: string;
    note?: string;
    maxUses?: number;
    expiresAt?: Date | null;
  },
): Promise<PilotInvite> {
  const code =
    input?.code != null
      ? normalizeInviteCode(input.code)
      : `CG-${randomBytes(4).toString("hex").toUpperCase()}`;
  if (code.length < 6) {
    throw new InviteError("invalid", "Invite code too short");
  }
  const now = new Date();
  const [row] = await db
    .insert(pilotInvites)
    .values({
      id: crypto.randomUUID(),
      code,
      note: input?.note ?? null,
      maxUses: input?.maxUses ?? 1,
      useCount: 0,
      redeemedByUserId: null,
      expiresAt: input?.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("Failed to create invite");
  return row;
}

/**
 * Redeem an invite for workspace creation. Increments use_count atomically.
 */
export async function redeemPilotInvite(
  db: Database,
  input: { code: string; userId: string },
): Promise<PilotInvite> {
  const code = normalizeInviteCode(input.code);
  if (!code) {
    throw new InviteError("invalid", "Invite code is required");
  }

  const now = new Date();
  const [row] = await db
    .update(pilotInvites)
    .set({
      useCount: sql`${pilotInvites.useCount} + 1`,
      redeemedByUserId: input.userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(pilotInvites.code, code),
        sql`${pilotInvites.useCount} < ${pilotInvites.maxUses}`,
        or(isNull(pilotInvites.expiresAt), gt(pilotInvites.expiresAt, now)),
      ),
    )
    .returning();

  if (!row) {
    const [existing] = await db
      .select()
      .from(pilotInvites)
      .where(eq(pilotInvites.code, code))
      .limit(1);
    if (!existing) {
      throw new InviteError("invalid", "Invite code not found");
    }
    if (existing.expiresAt && existing.expiresAt.getTime() <= now.getTime()) {
      throw new InviteError("expired", "Invite code expired");
    }
    throw new InviteError("exhausted", "Invite code already used");
  }

  await recordAuditEvent(db, {
    workspaceId: null,
    actor: input.userId,
    action: "pilot_invite.redeemed",
    targetType: "pilot_invite",
    targetId: row.id,
    meta: { codeHash: createHash("sha256").update(code).digest("hex").slice(0, 16) },
  });

  return row;
}
