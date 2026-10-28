import {
  assertSafeMcpServerEndpoint,
  sanitizeMcpToolResult,
  type SafeEndpointOptions,
} from "./security-boundary.js";

export type McpJsonRpcClientOptions = {
  endpointUrl: string;
  /** Optional bearer token (never logged). */
  bearerToken?: string;
  fetchImpl?: typeof fetch;
  endpointOptions?: SafeEndpointOptions;
  timeoutMs?: number;
};

export type McpListedTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

let rpcId = 1;

async function mcpRpc(
  options: McpJsonRpcClientOptions,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const safety = assertSafeMcpServerEndpoint(
    options.endpointUrl,
    options.endpointOptions ?? {},
  );
  if (!safety.ok) {
    throw new Error(`unsafe_mcp_endpoint:${safety.reason}`);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options.bearerToken?.trim()) {
    headers.Authorization = `Bearer ${options.bearerToken.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(options.endpointUrl.replace(/\/+$/, ""), {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method,
        ...(params ? { params } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`mcp_http_${res.status}`);
    }
    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) {
      throw new Error(
        `mcp_rpc_error:${body.error.message ?? body.error.code ?? "unknown"}`,
      );
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function listMcpTools(
  options: McpJsonRpcClientOptions,
): Promise<McpListedTool[]> {
  const result = (await mcpRpc(options, "tools/list", {})) as {
    tools?: unknown;
  };
  if (!Array.isArray(result?.tools)) return [];
  return result.tools
    .filter(
      (t): t is Record<string, unknown> =>
        Boolean(t) && typeof t === "object" && typeof (t as { name?: unknown }).name === "string",
    )
    .map((t) => ({
      name: String(t.name),
      description:
        typeof t.description === "string" ? t.description : undefined,
      inputSchema:
        t.inputSchema && typeof t.inputSchema === "object"
          ? (t.inputSchema as Record<string, unknown>)
          : undefined,
    }));
}

export async function callMcpTool(
  options: McpJsonRpcClientOptions,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await mcpRpc(options, "tools/call", {
    name: toolName,
    arguments: args ?? {},
  });
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return sanitizeMcpToolResult(result as Record<string, unknown>);
  }
  return sanitizeMcpToolResult({ result });
}
