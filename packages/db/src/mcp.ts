import { and, eq } from "drizzle-orm";
import { assertSafeServerFetchUrlResolved } from "@coppergate/sandbox/policy";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  workspaceMcpConnections,
  type WorkspaceMcpConnection,
} from "./schema.js";

export const MCP_PROVIDERS = ["sonarqube", "mcp"] as const;
export type McpProvider = (typeof MCP_PROVIDERS)[number];

export const SONARQUBE_TOOLS = [
  "sonar_list_issues",
  "sonar_quality_gate",
  "sonar_hotspots",
] as const;

export function isMcpProvider(v: string): v is McpProvider {
  return (MCP_PROVIDERS as readonly string[]).includes(v);
}

/** Default connection tool allowlist when caller omits one. */
export function defaultToolsForProvider(provider: McpProvider): string[] {
  if (provider === "sonarqube") return [...SONARQUBE_TOOLS];
  return [];
}

export function parseToolAllowlistJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/**
 * Fail-closed: only tools in both connection allowlist and profile allowlist
 * (or profile includes `mcp:sonarqube` / `mcp:*`).
 */
export function filterMcpToolsForProfile(input: {
  provider: string;
  connectionTools: string[];
  profileToolAllowlist: string[];
}): string[] {
  const profile = new Set(input.profileToolAllowlist);
  const providerTag = `mcp:${input.provider}`;
  const allowed =
    profile.has("mcp:*") ||
    profile.has(providerTag) ||
    input.connectionTools.some((t) => profile.has(t));
  if (!allowed) return [];
  if (profile.has("mcp:*") || profile.has(providerTag)) {
    return [...input.connectionTools];
  }
  return input.connectionTools.filter((t) => profile.has(t));
}

export async function listMcpConnections(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceMcpConnection[]> {
  return db
    .select()
    .from(workspaceMcpConnections)
    .where(eq(workspaceMcpConnections.workspaceId, workspaceId));
}

export async function getMcpConnection(
  db: Database,
  workspaceId: string,
  provider: string,
): Promise<WorkspaceMcpConnection | null> {
  const [row] = await db
    .select()
    .from(workspaceMcpConnections)
    .where(
      and(
        eq(workspaceMcpConnections.workspaceId, workspaceId),
        eq(workspaceMcpConnections.provider, provider),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertMcpConnection(
  db: Database,
  input: {
    workspaceId: string;
    provider: McpProvider;
    displayName: string;
    endpointUrl: string;
    encryptedPayload: string;
    enabled?: boolean;
    toolAllowlist?: string[];
    actor: string;
    meta?: Record<string, unknown>;
  },
): Promise<WorkspaceMcpConnection> {
  if (!isMcpProvider(input.provider)) {
    throw new Error("unsupported MCP provider");
  }
  const endpoint = input.endpointUrl.trim().replace(/\/+$/, "");
  try {
    // Sonar self-host may live on private nets; generic MCP follows ACPP §10.6
    // (HTTPS + no private) via DNS-resolved check with allowPrivate=false.
    await assertSafeServerFetchUrlResolved(endpoint, {
      allowPrivate: input.provider === "sonarqube",
    });
  } catch {
    throw new Error(
      input.provider === "mcp"
        ? "endpointUrl must be a public https URL (SSRF-safe; no private/metadata)"
        : "endpointUrl must be a safe http(s) URL (metadata/link-local blocked)",
    );
  }
  const tools =
    input.toolAllowlist ?? defaultToolsForProvider(input.provider);
  if (input.provider === "mcp" && tools.length === 0) {
    throw new Error("generic MCP connections require a non-empty toolAllowlist");
  }
  const now = new Date();
  const existing = await getMcpConnection(
    db,
    input.workspaceId,
    input.provider,
  );

  if (existing) {
    const [updated] = await db
      .update(workspaceMcpConnections)
      .set({
        displayName: input.displayName.trim().slice(0, 80) || existing.displayName,
        endpointUrl: endpoint,
        // Empty string keeps the prior vault blob (token omitted on update).
        encryptedPayload: input.encryptedPayload.trim()
          ? input.encryptedPayload
          : existing.encryptedPayload,
        enabled: input.enabled ?? existing.enabled,
        toolAllowlistJson:
          input.toolAllowlist !== undefined
            ? JSON.stringify(tools)
            : existing.toolAllowlistJson,
        metaJson:
          input.meta === undefined
            ? existing.metaJson
            : JSON.stringify(input.meta),
        updatedAt: now,
      })
      .where(eq(workspaceMcpConnections.id, existing.id))
      .returning();
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "mcp.update",
      targetType: "mcp_connection",
      targetId: updated!.id,
      meta: { provider: input.provider },
    });
    return updated!;
  }

  const [created] = await db
    .insert(workspaceMcpConnections)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      provider: input.provider,
      displayName: input.displayName.trim().slice(0, 80) || input.provider,
      endpointUrl: endpoint,
      encryptedPayload: input.encryptedPayload,
      enabled: input.enabled ?? true,
      toolAllowlistJson: JSON.stringify(tools),
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "mcp.create",
    targetType: "mcp_connection",
    targetId: created!.id,
    meta: { provider: input.provider },
  });
  return created!;
}

export async function setMcpConnectionEnabled(
  db: Database,
  input: {
    workspaceId: string;
    provider: string;
    enabled: boolean;
    actor: string;
  },
): Promise<WorkspaceMcpConnection | null> {
  const existing = await getMcpConnection(
    db,
    input.workspaceId,
    input.provider,
  );
  if (!existing) return null;
  const [updated] = await db
    .update(workspaceMcpConnections)
    .set({ enabled: input.enabled, updatedAt: new Date() })
    .where(eq(workspaceMcpConnections.id, existing.id))
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: input.enabled ? "mcp.enable" : "mcp.disable",
    targetType: "mcp_connection",
    targetId: existing.id,
    meta: { provider: input.provider },
  });
  return updated ?? null;
}

/** Patch connection tool allowlist (and optional display name). */
export async function updateMcpConnectionTools(
  db: Database,
  input: {
    workspaceId: string;
    provider: string;
    toolAllowlist: string[];
    actor: string;
  },
): Promise<WorkspaceMcpConnection | null> {
  const existing = await getMcpConnection(
    db,
    input.workspaceId,
    input.provider,
  );
  if (!existing) return null;
  const tools = input.toolAllowlist
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 64);
  if (tools.length === 0) {
    throw new Error("toolAllowlist must be non-empty");
  }
  const [updated] = await db
    .update(workspaceMcpConnections)
    .set({
      toolAllowlistJson: JSON.stringify(tools),
      updatedAt: new Date(),
    })
    .where(eq(workspaceMcpConnections.id, existing.id))
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "mcp.tools_update",
    targetType: "mcp_connection",
    targetId: existing.id,
    meta: { provider: input.provider, tools },
  });
  return updated ?? null;
}

export async function deleteMcpConnection(
  db: Database,
  input: {
    workspaceId: string;
    provider: string;
    actor: string;
  },
): Promise<{ deleted: boolean }> {
  const existing = await getMcpConnection(
    db,
    input.workspaceId,
    input.provider,
  );
  if (!existing) return { deleted: false };
  await db
    .delete(workspaceMcpConnections)
    .where(eq(workspaceMcpConnections.id, existing.id));
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "mcp.delete",
    targetType: "mcp_connection",
    targetId: existing.id,
    meta: { provider: input.provider },
  });
  return { deleted: true };
}

/** Public view without secrets. */
export function serializeMcpConnectionPublic(row: WorkspaceMcpConnection) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    displayName: row.displayName,
    endpointUrl: row.endpointUrl,
    enabled: row.enabled,
    tools: parseToolAllowlistJson(row.toolAllowlistJson),
    hasCredentials: Boolean(row.encryptedPayload?.length),
    updatedAt: row.updatedAt.toISOString(),
  };
}
