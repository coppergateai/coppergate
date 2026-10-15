import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  integrationCredentials,
  type IntegrationCredential,
} from "./schema.js";

export class CredentialError extends Error {
  readonly code: "not_found" | "invalid" | "conflict";
  constructor(code: CredentialError["code"], message: string) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

export type LlmByokMeta = {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  model: string | null;
  status: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toMeta(row: IntegrationCredential): LlmByokMeta {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    model: row.model,
    status: row.status,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getActiveLlmByok(
  db: Database,
  workspaceId: string,
): Promise<IntegrationCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertLlmByok(
  db: Database,
  input: {
    workspaceId: string;
    actor: string;
    encryptedPayload: string;
    label?: string;
    baseUrl?: string | null;
    model?: string | null;
  },
): Promise<LlmByokMeta> {
  if (!input.encryptedPayload.trim()) {
    throw new CredentialError("invalid", "encrypted payload required");
  }
  const existing = await getActiveLlmByok(db, input.workspaceId);
  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(integrationCredentials)
      .set({
        encryptedPayload: input.encryptedPayload,
        label: input.label?.trim() || existing.label,
        baseUrl: input.baseUrl === undefined ? existing.baseUrl : input.baseUrl,
        model: input.model === undefined ? existing.model : input.model,
        status: "active",
        updatedAt: now,
      })
      .where(eq(integrationCredentials.id, existing.id))
      .returning();
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "credentials.llm_byok.upsert",
      targetType: "credential",
      targetId: existing.id,
      meta: { updated: true },
    });
    return toMeta(updated!);
  }

  const id = crypto.randomUUID();
  const [created] = await db
    .insert(integrationCredentials)
    .values({
      id,
      workspaceId: input.workspaceId,
      provider: "llm_byok",
      label: input.label?.trim() || "default",
      encryptedPayload: input.encryptedPayload,
      baseUrl: input.baseUrl ?? null,
      model: input.model ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "credentials.llm_byok.upsert",
    targetType: "credential",
    targetId: id,
    meta: { created: true },
  });
  return toMeta(created!);
}

export async function revokeLlmByok(
  db: Database,
  input: { workspaceId: string; actor: string },
): Promise<LlmByokMeta | null> {
  const existing = await getActiveLlmByok(db, input.workspaceId);
  if (!existing) return null;
  const now = new Date();
  const [updated] = await db
    .update(integrationCredentials)
    .set({
      status: "revoked",
      encryptedPayload: "",
      updatedAt: now,
    })
    .where(eq(integrationCredentials.id, existing.id))
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "credentials.llm_byok.revoke",
    targetType: "credential",
    targetId: existing.id,
    meta: {},
  });
  return updated ? toMeta(updated) : null;
}

export async function touchLlmByokUsed(
  db: Database,
  workspaceId: string,
): Promise<void> {
  const existing = await getActiveLlmByok(db, workspaceId);
  if (!existing) return;
  await db
    .update(integrationCredentials)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(integrationCredentials.id, existing.id));
}

export async function purgeLlmByokCredentials(
  db: Database,
  workspaceId: string,
): Promise<boolean> {
  const result = await db
    .update(integrationCredentials)
    .set({
      status: "revoked",
      encryptedPayload: "",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
      ),
    )
    .returning({ id: integrationCredentials.id });
  return result.length > 0;
}

/**
 * TASK126 — rotate BYOK: revoke active + upsert new ciphertext in one audit trail.
 */
export async function rotateLlmByokCredential(
  db: Database,
  input: {
    workspaceId: string;
    encryptedPayload: string;
    actor: string;
    label?: string | null;
  },
): Promise<LlmByokMeta> {
  await revokeLlmByok(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
  });
  const meta = await upsertLlmByok(db, {
    workspaceId: input.workspaceId,
    encryptedPayload: input.encryptedPayload,
    actor: input.actor,
    label: input.label?.trim() || "rotated",
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "credentials.llm_byok.rotate",
    targetType: "credential",
    targetId: meta.id,
    meta: { label: input.label ?? "rotated" },
  });
  return meta;
}
