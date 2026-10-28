/**
 * ACPP-aligned MCP security boundary (PRODUCT §10.6).
 * Kept in Coppergate without an @acpp/* dependency.
 */

export type SafeEndpointResult =
  | { ok: true }
  | { ok: false; reason: string };

export type SafeEndpointOptions = {
  /** Local dev only — still blocks private ranges except loopback when true. */
  allowLocalhost?: boolean;
};

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number.parseInt(p, 10));
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Reject SSRF-prone MCP server URLs before registration or invoke. */
export function assertSafeMcpServerEndpoint(
  urlString: string,
  options: SafeEndpointOptions = {},
): SafeEndpointResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "unsupported_protocol" };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "blocked_host" };
  }

  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (isLoopback) {
    if (!options.allowLocalhost) {
      return { ok: false, reason: "localhost_not_allowed" };
    }
    return { ok: true };
  }

  if (parsed.protocol === "http:") {
    return { ok: false, reason: "https_required_for_remote" };
  }

  if (isPrivateIpv4(host)) {
    return { ok: false, reason: "private_address_not_allowed" };
  }

  return { ok: true };
}

export function filterPermittedMcpTools<T extends { name: string }>(
  catalog: readonly T[],
  permittedToolNames: readonly string[],
): T[] {
  const allowed = new Set(permittedToolNames);
  return catalog.filter((tool) => allowed.has(tool.name));
}

export function isToolOnConnectionAllowlist(
  connectionAllowedTools: readonly string[],
  toolName: string,
): boolean {
  return connectionAllowedTools.includes(toolName);
}

/** Strip fields that must not cross the gateway boundary to agents. */
export function sanitizeMcpToolResult(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const forbidden = new Set([
    "accesstoken",
    "refreshtoken",
    "clientsecret",
    "password",
    "authorization",
    "set-cookie",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (forbidden.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

/** Scrub a free-form summary string of credential-like substrings. */
export function scrubToolSummary(raw: string, maxLen = 2_000): string {
  const scrubbed = raw
    .replace(
      /(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  return scrubbed.length > maxLen
    ? `${scrubbed.slice(0, maxLen)}…`
    : scrubbed;
}
