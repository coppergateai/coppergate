/**
 * Worker-side MCP/Sonar tool preflight for Cursor (and shared OpenAI invoker).
 */
import {
  ToolRuntime,
  type ToolInvoker,
  type ToolInvokeRequest,
  type ToolInvokeResult,
} from "@coppergate/agents";
import {
  callSonarTool,
  filterMcpToolsForProfile,
  getMcpConnection,
  listMcpConnections,
  listWorkspaceToolDefs,
  parseToolAllowlistJson,
  type Database,
  type SonarToolName,
} from "@coppergate/db";
import {
  callMcpTool,
  invokeViaAcppGateway,
  resolveAcppGatewayUrl,
  scrubToolSummary,
} from "@coppergate/mcp-client";
import { openSecret, parseEncryptionKey } from "@coppergate/github";

const SONAR_TOOLS = new Set<string>([
  "sonar_list_issues",
  "sonar_quality_gate",
  "sonar_hotspots",
]);

function summarizeJson(value: unknown, max = 1_500): string {
  try {
    return scrubToolSummary(JSON.stringify(value), max);
  } catch {
    return scrubToolSummary(String(value), max);
  }
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function buildWorkspaceToolInvoker(input: {
  db: Database;
  workspaceId: string;
  profileAllowlist: string[];
  encryptionKeyHex?: string;
}): Promise<{
  invoker: ToolInvoker;
  invokableTools: string[];
  aliases: Map<string, string>;
  customTools: Set<string>;
  runtime: ToolRuntime;
}> {
  const connections = await listMcpConnections(input.db, input.workspaceId);
  const defs = await listWorkspaceToolDefs(input.db, input.workspaceId);
  const aliases = new Map<string, string>();
  const customTools = new Set<string>();
  for (const d of defs) {
    if (d.kind === "alias" && d.targetToken) {
      aliases.set(d.key, d.targetToken);
    }
    if (d.kind === "custom") customTools.add(d.key);
  }

  const invokableTools: string[] = [];
  for (const conn of connections) {
    if (!conn.enabled) continue;
    const connTools = parseToolAllowlistJson(conn.toolAllowlistJson);
    const filtered = filterMcpToolsForProfile({
      provider: conn.provider,
      connectionTools: connTools,
      profileToolAllowlist: input.profileAllowlist,
    });
    for (const t of filtered) {
      if (!invokableTools.includes(t)) invokableTools.push(t);
    }
  }

  const keyHex =
    input.encryptionKeyHex?.trim() ||
    process.env.CREDENTIALS_ENCRYPTION_KEY?.trim() ||
    "";

  const invoker: ToolInvoker = async (
    req: ToolInvokeRequest,
  ): Promise<ToolInvokeResult> => {
    const started = Date.now();
    const tool = req.tool;

    const acppUrl = resolveAcppGatewayUrl();
    if (acppUrl && !SONAR_TOOLS.has(tool)) {
      const mcpConn = connections.find(
        (c) => c.enabled && c.provider === "mcp",
      );
      if (mcpConn) {
        const bridged = await invokeViaAcppGateway({
          gatewayUrl: acppUrl,
          body: {
            workspaceId: input.workspaceId,
            connectionId: mcpConn.id,
            subject: `coppergate:workspace:${input.workspaceId}`,
            toolName: tool,
            arguments: req.args,
          },
          authToken: process.env.ACPP_GATEWAY_TOKEN?.trim() || undefined,
        });
        return {
          ok: bridged.ok,
          summary: bridged.ok
            ? summarizeJson(bridged.result)
            : bridged.error ?? "acpp_invoke_failed",
          result: bridged.result,
          error: bridged.error,
          ms: Date.now() - started,
        };
      }
    }

    if (SONAR_TOOLS.has(tool)) {
      const conn = await getMcpConnection(
        input.db,
        input.workspaceId,
        "sonarqube",
      );
      if (!conn?.enabled) {
        return {
          ok: false,
          summary: "sonarqube connection missing or disabled",
          error: "connection_unavailable",
          ms: Date.now() - started,
        };
      }
      if (!keyHex) {
        return {
          ok: false,
          summary: "credentials encryption key not configured",
          error: "missing_encryption_key",
          ms: Date.now() - started,
        };
      }
      const token = openSecret(
        conn.encryptedPayload,
        parseEncryptionKey(keyHex),
      );
      const meta = parseMeta(conn.metaJson);
      const projectKey =
        typeof meta.projectKey === "string" ? meta.projectKey : undefined;
      const args = {
        ...(projectKey ? { projectKey } : {}),
        ...(req.args ?? {}),
      };
      try {
        const result = await callSonarTool({
          endpointUrl: conn.endpointUrl,
          token,
          tool: tool as SonarToolName,
          args,
        });
        return {
          ok: true,
          summary: summarizeJson(result),
          result:
            result && typeof result === "object"
              ? (result as Record<string, unknown>)
              : { result },
          ms: Date.now() - started,
        };
      } catch (err) {
        return {
          ok: false,
          summary: err instanceof Error ? err.message : String(err),
          error: err instanceof Error ? err.message : String(err),
          ms: Date.now() - started,
        };
      }
    }

    const mcpConn = connections.find((c) => c.enabled && c.provider === "mcp");
    if (!mcpConn) {
      return {
        ok: false,
        summary: "no generic MCP connection",
        error: "connection_unavailable",
        ms: Date.now() - started,
      };
    }
    let bearer: string | undefined;
    if (mcpConn.encryptedPayload && keyHex) {
      try {
        const opened = openSecret(
          mcpConn.encryptedPayload,
          parseEncryptionKey(keyHex),
        );
        bearer =
          opened && opened !== "mcp:no-token" ? opened : undefined;
      } catch {
        bearer = undefined;
      }
    }
    try {
      const result = await callMcpTool(
        {
          endpointUrl: mcpConn.endpointUrl,
          bearerToken: bearer,
          endpointOptions: {
            allowLocalhost: process.env.NODE_ENV !== "production",
          },
        },
        tool,
        req.args,
      );
      return {
        ok: true,
        summary: summarizeJson(result),
        result,
        ms: Date.now() - started,
      };
    } catch (err) {
      return {
        ok: false,
        summary: err instanceof Error ? err.message : String(err),
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - started,
      };
    }
  };

  const runtime = new ToolRuntime({
    allowlist: input.profileAllowlist,
    invokableTools,
    aliases,
    customTools,
    invoke: invoker,
    maxInvokes: 4,
  });

  return { invoker, invokableTools, aliases, customTools, runtime };
}
