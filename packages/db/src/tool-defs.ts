import { and, asc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  workspaceToolDefs,
  type WorkspaceToolDef,
  type WorkspaceToolDefKind,
} from "./schema.js";

export class ToolDefError extends Error {
  readonly code: "not_found" | "invalid" | "forbidden";
  constructor(code: ToolDefError["code"], message: string) {
    super(message);
    this.name = "ToolDefError";
    this.code = code;
  }
}

/** Core / alias tokens that cannot be redefined as workspace tool defs. */
export const RESERVED_TOOL_KEYS = new Set([
  "read",
  "edit",
  "test",
  "git",
  "write",
  "write_file",
  "put_file",
  "mcp:sonarqube",
  "mcp:*",
]);

export const CORE_ALLOWLIST_TOOLS = new Set([
  "read",
  "edit",
  "test",
  "git",
  "mcp:sonarqube",
  "mcp:*",
]);

export const TOOL_DEF_KINDS = ["mcp", "alias", "custom"] as const;

export function isWorkspaceToolDefKind(v: string): v is WorkspaceToolDefKind {
  return (TOOL_DEF_KINDS as readonly string[]).includes(v);
}

export function normalizeToolDefKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isValidToolDefKey(key: string): boolean {
  return (
    /^[a-z0-9][a-z0-9_.:-]{1,62}$/.test(key) && !RESERVED_TOOL_KEYS.has(key)
  );
}

const CORE_TARGETS = new Set(["read", "edit", "test", "git"]);

function assertTargetToken(
  kind: WorkspaceToolDefKind,
  targetToken: string | null | undefined,
): string | null {
  const raw = targetToken?.trim() || null;
  if (kind === "custom") {
    return raw;
  }
  if (!raw) {
    throw new ToolDefError(
      "invalid",
      `${kind} tool defs require targetToken`,
    );
  }
  if (kind === "alias" && !CORE_TARGETS.has(raw)) {
    throw new ToolDefError(
      "invalid",
      "alias targetToken must be a core tool (read|edit|test|git)",
    );
  }
  if (kind === "mcp" && !raw.startsWith("mcp:") && !raw.startsWith("sonar_")) {
    throw new ToolDefError(
      "invalid",
      "mcp targetToken must be mcp:… or sonar_*",
    );
  }
  return raw;
}

export async function listWorkspaceToolDefs(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceToolDef[]> {
  return db
    .select()
    .from(workspaceToolDefs)
    .where(eq(workspaceToolDefs.workspaceId, workspaceId))
    .orderBy(asc(workspaceToolDefs.key));
}

export async function listWorkspaceToolDefKeys(
  db: Database,
  workspaceId: string,
): Promise<Set<string>> {
  const rows = await listWorkspaceToolDefs(db, workspaceId);
  return new Set(rows.map((r) => r.key));
}

/**
 * Fail-closed allowlist check: core set ∪ sonar_* ∪ workspace-defined keys.
 */
export async function assertProfileToolAllowlist(
  db: Database,
  workspaceId: string,
  tools: string[],
): Promise<void> {
  const defs = await listWorkspaceToolDefKeys(db, workspaceId);
  for (const t of tools) {
    if (CORE_ALLOWLIST_TOOLS.has(t)) continue;
    if (t.startsWith("sonar_")) continue;
    if (t.startsWith("mcp:") && t.length > 4) continue;
    if (defs.has(t)) continue;
    throw new ToolDefError(
      "forbidden",
      `tool ${t} not allowed — cannot escalate tools`,
    );
  }
}

export async function upsertWorkspaceToolDef(
  db: Database,
  input: {
    workspaceId: string;
    key: string;
    title: string;
    description?: string;
    kind?: string;
    targetToken?: string | null;
    actor: string;
  },
): Promise<WorkspaceToolDef> {
  const key = normalizeToolDefKey(input.key);
  if (!isValidToolDefKey(key)) {
    throw new ToolDefError("invalid", "invalid tool key");
  }
  const kindRaw = (input.kind ?? "custom").trim().toLowerCase();
  if (!isWorkspaceToolDefKind(kindRaw)) {
    throw new ToolDefError("invalid", "kind must be mcp|alias|custom");
  }
  const targetToken = assertTargetToken(kindRaw, input.targetToken);
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new ToolDefError("invalid", "title required");
  const description = (input.description ?? "").trim().slice(0, 2000);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(workspaceToolDefs)
    .where(
      and(
        eq(workspaceToolDefs.workspaceId, input.workspaceId),
        eq(workspaceToolDefs.key, key),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(workspaceToolDefs)
      .set({
        title,
        description,
        kind: kindRaw,
        targetToken,
        updatedAt: now,
      })
      .where(eq(workspaceToolDefs.id, existing.id))
      .returning();
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "tool.update",
      targetType: "workspace_tool_def",
      targetId: updated!.id,
      meta: { key },
    });
    return updated!;
  }

  const [created] = await db
    .insert(workspaceToolDefs)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      key,
      title,
      description,
      kind: kindRaw,
      targetToken,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "tool.create",
    targetType: "workspace_tool_def",
    targetId: created!.id,
    meta: { key },
  });
  return created!;
}

export async function deleteWorkspaceToolDef(
  db: Database,
  input: {
    workspaceId: string;
    key: string;
    actor: string;
  },
): Promise<{ deleted: boolean }> {
  const key = normalizeToolDefKey(input.key);
  const [existing] = await db
    .select()
    .from(workspaceToolDefs)
    .where(
      and(
        eq(workspaceToolDefs.workspaceId, input.workspaceId),
        eq(workspaceToolDefs.key, key),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new ToolDefError("not_found", "tool def not found");
  }
  await db
    .delete(workspaceToolDefs)
    .where(eq(workspaceToolDefs.id, existing.id));
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "tool.delete",
    targetType: "workspace_tool_def",
    targetId: existing.id,
    meta: { key },
  });
  return { deleted: true };
}
