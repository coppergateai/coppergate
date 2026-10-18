import { and, asc, desc, eq } from "drizzle-orm";
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
  vendor: string;
  baseUrl: string | null;
  model: string | null;
  isDefault: boolean;
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
    vendor: row.vendor,
    baseUrl: row.baseUrl,
    model: row.model,
    isDefault: row.isDefault,
    status: row.status,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function slugifyLabel(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "default";
}

export function suggestLlmConnectionLabel(
  vendor: string,
  model: string | null | undefined,
): string {
  const short = (model ?? "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slugifyLabel(`${vendor}-${short || "default"}`);
}

export async function listLlmByok(
  db: Database,
  workspaceId: string,
): Promise<LlmByokMeta[]> {
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
      ),
    )
    .orderBy(desc(integrationCredentials.isDefault), asc(integrationCredentials.label));
  return rows.map(toMeta);
}

export async function getLlmByokById(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<IntegrationCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.id, id),
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getDefaultLlmByok(
  db: Database,
  workspaceId: string,
): Promise<IntegrationCredential | null> {
  const [def] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
        eq(integrationCredentials.isDefault, true),
      ),
    )
    .limit(1);
  if (def) return def;

  const [any] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
      ),
    )
    .orderBy(asc(integrationCredentials.createdAt))
    .limit(1);
  return any ?? null;
}

/** @deprecated Prefer getDefaultLlmByok — alias for callers. */
export async function getActiveLlmByok(
  db: Database,
  workspaceId: string,
): Promise<IntegrationCredential | null> {
  return getDefaultLlmByok(db, workspaceId);
}

async function clearDefaults(
  db: Database,
  workspaceId: string,
  exceptId?: string,
): Promise<void> {
  const actives = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.workspaceId, workspaceId),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.status, "active"),
        eq(integrationCredentials.isDefault, true),
      ),
    );
  for (const row of actives) {
    if (exceptId && row.id === exceptId) continue;
    await db
      .update(integrationCredentials)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(integrationCredentials.id, row.id));
  }
}

export async function setDefaultLlmByok(
  db: Database,
  input: { workspaceId: string; id: string; actor: string },
): Promise<LlmByokMeta> {
  const row = await getLlmByokById(db, input.workspaceId, input.id);
  if (!row) throw new CredentialError("not_found", "credential not found");
  await clearDefaults(db, input.workspaceId, row.id);
  const [updated] = await db
    .update(integrationCredentials)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(integrationCredentials.id, row.id))
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "credentials.llm_byok.set_default",
    targetType: "credential",
    targetId: row.id,
    meta: {},
  });
  return toMeta(updated!);
}

export async function createLlmByok(
  db: Database,
  input: {
    workspaceId: string;
    actor: string;
    vendor: string;
    label?: string;
    encryptedPayload?: string;
    reuseKeyFromId?: string;
    baseUrl?: string | null;
    model?: string | null;
    setDefault?: boolean;
  },
): Promise<LlmByokMeta> {
  const vendor = input.vendor.trim().toLowerCase();
  if (!vendor) throw new CredentialError("invalid", "vendor required");

  let encryptedPayload = input.encryptedPayload?.trim() ?? "";
  if (input.reuseKeyFromId) {
    const source = await getLlmByokById(
      db,
      input.workspaceId,
      input.reuseKeyFromId,
    );
    if (!source?.encryptedPayload) {
      throw new CredentialError("not_found", "reuseKeyFromId not found");
    }
    encryptedPayload = source.encryptedPayload;
  }
  if (!encryptedPayload) {
    throw new CredentialError("invalid", "encrypted payload required");
  }

  const baseLabel = slugifyLabel(
    input.label?.trim() ||
      suggestLlmConnectionLabel(vendor, input.model ?? null),
  );
  const taken = new Set(
    (
      await db
        .select({ label: integrationCredentials.label })
        .from(integrationCredentials)
        .where(
          and(
            eq(integrationCredentials.workspaceId, input.workspaceId),
            eq(integrationCredentials.provider, "llm_byok"),
            eq(integrationCredentials.status, "active"),
          ),
        )
    ).map((r) => r.label),
  );
  let label = baseLabel;
  if (taken.has(label)) {
    let n = 2;
    while (taken.has(`${baseLabel}-${n}`) && n < 100) n += 1;
    label = `${baseLabel}-${n}`;
  }

  const actives = await listLlmByok(db, input.workspaceId);
  const makeDefault =
    input.setDefault === true || actives.length === 0;

  if (makeDefault) {
    await clearDefaults(db, input.workspaceId);
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const [created] = await db
    .insert(integrationCredentials)
    .values({
      id,
      workspaceId: input.workspaceId,
      provider: "llm_byok",
      label,
      vendor,
      encryptedPayload,
      baseUrl: input.baseUrl ?? null,
      model: input.model ?? null,
      isDefault: makeDefault,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "credentials.llm_byok.create",
    targetType: "credential",
    targetId: id,
    meta: {
      vendor,
      label,
      reused: Boolean(input.reuseKeyFromId),
      isDefault: makeDefault,
    },
  });
  return toMeta(created!);
}

export async function updateLlmByok(
  db: Database,
  input: {
    workspaceId: string;
    id: string;
    actor: string;
    encryptedPayload?: string;
    label?: string;
    vendor?: string;
    baseUrl?: string | null;
    model?: string | null;
    setDefault?: boolean;
  },
): Promise<LlmByokMeta> {
  const existing = await getLlmByokById(db, input.workspaceId, input.id);
  if (!existing) throw new CredentialError("not_found", "credential not found");

  const label =
    input.label !== undefined
      ? slugifyLabel(input.label)
      : existing.label;

  if (label !== existing.label) {
    const clash = await db
      .select({ id: integrationCredentials.id })
      .from(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.workspaceId, input.workspaceId),
          eq(integrationCredentials.provider, "llm_byok"),
          eq(integrationCredentials.label, label),
          eq(integrationCredentials.status, "active"),
        ),
      )
      .limit(1);
    if (clash[0] && clash[0].id !== existing.id) {
      throw new CredentialError(
        "conflict",
        `connection label "${label}" already exists`,
      );
    }
  }

  if (input.setDefault === true) {
    await clearDefaults(db, input.workspaceId, existing.id);
  }

  const [updated] = await db
    .update(integrationCredentials)
    .set({
      encryptedPayload:
        input.encryptedPayload?.trim() || existing.encryptedPayload,
      label,
      vendor:
        input.vendor !== undefined
          ? input.vendor.trim().toLowerCase() || existing.vendor
          : existing.vendor,
      baseUrl: input.baseUrl === undefined ? existing.baseUrl : input.baseUrl,
      model: input.model === undefined ? existing.model : input.model,
      isDefault:
        input.setDefault === true ? true : existing.isDefault,
      updatedAt: new Date(),
    })
    .where(eq(integrationCredentials.id, existing.id))
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "credentials.llm_byok.update",
    targetType: "credential",
    targetId: existing.id,
    meta: {},
  });
  return toMeta(updated!);
}

/**
 * Legacy single-slot upsert — updates default connection or creates one.
 * Prefer createLlmByok / updateLlmByok for multi-connection.
 */
export async function upsertLlmByok(
  db: Database,
  input: {
    workspaceId: string;
    actor: string;
    encryptedPayload: string;
    label?: string;
    vendor?: string;
    baseUrl?: string | null;
    model?: string | null;
  },
): Promise<LlmByokMeta> {
  if (!input.encryptedPayload.trim()) {
    throw new CredentialError("invalid", "encrypted payload required");
  }
  const existing = await getDefaultLlmByok(db, input.workspaceId);
  if (existing) {
    return updateLlmByok(db, {
      workspaceId: input.workspaceId,
      id: existing.id,
      actor: input.actor,
      encryptedPayload: input.encryptedPayload,
      label: input.label,
      vendor: input.vendor,
      baseUrl: input.baseUrl,
      model: input.model,
      setDefault: true,
    });
  }
  return createLlmByok(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    vendor: input.vendor ?? "custom",
    label: input.label,
    encryptedPayload: input.encryptedPayload,
    baseUrl: input.baseUrl,
    model: input.model,
    setDefault: true,
  });
}

export async function revokeLlmByok(
  db: Database,
  input: { workspaceId: string; actor: string; id?: string },
): Promise<LlmByokMeta | null> {
  const existing = input.id
    ? await getLlmByokById(db, input.workspaceId, input.id)
    : await getDefaultLlmByok(db, input.workspaceId);
  if (!existing) return null;

  const wasDefault = existing.isDefault;
  const now = new Date();
  const [updated] = await db
    .update(integrationCredentials)
    .set({
      status: "revoked",
      encryptedPayload: "",
      isDefault: false,
      updatedAt: now,
    })
    .where(eq(integrationCredentials.id, existing.id))
    .returning();

  if (wasDefault) {
    const next = await getDefaultLlmByok(db, input.workspaceId);
    if (next && !next.isDefault) {
      await db
        .update(integrationCredentials)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(integrationCredentials.id, next.id));
    }
  }

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
  id?: string,
): Promise<void> {
  const existing = id
    ? await getLlmByokById(db, workspaceId, id)
    : await getDefaultLlmByok(db, workspaceId);
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
      isDefault: false,
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
 * TASK126 — rotate BYOK: revoke target (or default) + create new ciphertext.
 */
export async function rotateLlmByokCredential(
  db: Database,
  input: {
    workspaceId: string;
    encryptedPayload: string;
    actor: string;
    label?: string | null;
    vendor?: string;
    id?: string;
  },
): Promise<LlmByokMeta> {
  await revokeLlmByok(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    id: input.id,
  });
  const meta = await createLlmByok(db, {
    workspaceId: input.workspaceId,
    encryptedPayload: input.encryptedPayload,
    actor: input.actor,
    vendor: input.vendor ?? "custom",
    label: input.label?.trim() || "rotated",
    setDefault: true,
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
