import { sanitizeMcpToolResult, scrubToolSummary } from "./security-boundary.js";

export type AcppMcpInvokeRequest = {
  workspaceId: string;
  connectionId: string;
  subject: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  approvalId?: string;
};

export type AcppMcpInvokeResult = {
  ok: boolean;
  status: number;
  result?: Record<string, unknown>;
  error?: string;
  gate?: Record<string, unknown>;
};

/**
 * Proxy an MCP tool invoke through an ACPP hosted gateway when configured.
 */
export async function invokeViaAcppGateway(input: {
  gatewayUrl: string;
  body: AcppMcpInvokeRequest;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Optional bearer / service token for the gateway. */
  authToken?: string;
}): Promise<AcppMcpInvokeResult> {
  const base = input.gatewayUrl.replace(/\/+$/, "");
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (input.authToken?.trim()) {
    headers.Authorization = `Bearer ${input.authToken.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/v1/mcp/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      const message =
        typeof json.error === "string"
          ? json.error
          : typeof json.message === "string"
            ? json.message
            : `acpp_invoke_${res.status}`;
      return {
        ok: false,
        status: res.status,
        error: scrubToolSummary(message, 400),
        gate:
          json.gate && typeof json.gate === "object"
            ? (json.gate as Record<string, unknown>)
            : undefined,
      };
    }
    const rawResult =
      json.result && typeof json.result === "object"
        ? (json.result as Record<string, unknown>)
        : json;
    return {
      ok: true,
      status: res.status,
      result: sanitizeMcpToolResult(rawResult),
      gate:
        json.gate && typeof json.gate === "object"
          ? (json.gate as Record<string, unknown>)
          : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function resolveAcppGatewayUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const url = env.ACPP_GATEWAY_URL?.trim();
  return url || null;
}
