/**
 * Sandbox security policy — SECURITY.md §7 / D5.
 */

export const METADATA_IPV4 = "169.254.169.254";
export const METADATA_IPV6 = "fd00:ec2::254";

/** Hosts / CIDR-ish denials (exact host or IP match). */
export const BLOCKED_HOSTS = new Set([
  METADATA_IPV4,
  METADATA_IPV6,
  "metadata.google.internal",
  "metadata",
]);

/** Deny-by-default egress allowlist host suffixes. */
export const DEFAULT_EGRESS_ALLOW_SUFFIXES = [
  "github.com",
  "githubusercontent.com",
  "npmjs.org",
  "registry.npmjs.org",
  "yarnpkg.com",
] as const;

export const FORBIDDEN_MOUNTS = [
  "/var/run/docker.sock",
  "/run/docker.sock",
  "docker.sock",
] as const;

export const DEFAULT_LIMITS = {
  cpuShares: 512,
  memoryMb: 2048,
  pidsMax: 256,
  diskMb: 4096,
  wallClockMs: 15 * 60_000,
} as const;

export class SandboxPolicyError extends Error {
  readonly code:
    | "egress_denied"
    | "forbidden_mount"
    | "privileged"
    | "invalid"
    | "destroyed";

  constructor(code: SandboxPolicyError["code"], message: string) {
    super(message);
    this.name = "SandboxPolicyError";
    this.code = code;
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

export function isLinkLocalOrMetadata(host: string): boolean {
  const h = normalizeHost(host);
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.startsWith("169.254.")) return true;
  if (h.startsWith("fe80:")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "localhost" || h === "127.0.0.1") {
    // Loopback from sandbox is not useful for exfil to metadata; still deny
    // outbound to localhost as host-network adjacent.
    return true;
  }
  return false;
}

export function isEgressAllowed(
  host: string,
  allowSuffixes: readonly string[] = DEFAULT_EGRESS_ALLOW_SUFFIXES,
): boolean {
  const h = normalizeHost(host);
  if (!h) return false;
  if (isLinkLocalOrMetadata(h)) return false;
  // Block obvious private ranges (MVP prefer not).
  if (
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  ) {
    return false;
  }
  return allowSuffixes.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`),
  );
}

export function assertEgressAllowed(host: string): void {
  if (!isEgressAllowed(host)) {
    throw new SandboxPolicyError(
      "egress_denied",
      `Egress to ${host} is not allowlisted (metadata/private blocked)`,
    );
  }
}

export function assertNoDockerSocket(mounts: readonly string[]): void {
  for (const mount of mounts) {
    const normalized = mount.toLowerCase();
    for (const forbidden of FORBIDDEN_MOUNTS) {
      if (normalized.includes(forbidden)) {
        throw new SandboxPolicyError(
          "forbidden_mount",
          "Docker socket mount is forbidden",
        );
      }
    }
  }
}

export function assertNotPrivileged(privileged: boolean | undefined): void {
  if (privileged) {
    throw new SandboxPolicyError(
      "privileged",
      "Privileged containers are forbidden",
    );
  }
}

function isPrivateIpv4(host: string): boolean {
  if (
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return true;
  }
  if (host === "127.0.0.1" || host.startsWith("127.")) return true;
  if (host === "0.0.0.0") return true;
  return false;
}

function isLoopbackHost(host: string): boolean {
  const h = normalizeHost(host);
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h.endsWith(".localhost")
  );
}

export type SafeFetchUrlOptions = {
  /** Allow http://localhost / 127.0.0.1 (e.g. local Ollama). Default false. */
  allowLoopback?: boolean;
  /** Allow RFC1918 / private hosts (e.g. self-hosted Sonar). Default false. */
  allowPrivate?: boolean;
  /** Require https. Default false (http allowed when not private/metadata). */
  requireHttps?: boolean;
};

function isIpv4Literal(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isResolvedAddressBlocked(
  address: string,
  options: SafeFetchUrlOptions,
): boolean {
  const h = normalizeHost(address);
  if (isLinkLocalOrMetadata(h) && !isLoopbackHost(h)) return true;
  if (isLoopbackHost(h) && !options.allowLoopback) return true;
  if (!isLoopbackHost(h) && isPrivateIpv4(h) && !options.allowPrivate) {
    return true;
  }
  if (
    (h.startsWith("fc") ||
      h.startsWith("fd") ||
      h === "::" ||
      h.startsWith("fe80:")) &&
    !options.allowPrivate &&
    !options.allowLoopback
  ) {
    return true;
  }
  return false;
}

/**
 * Validate a URL before server-side fetch to reduce SSRF to metadata /
 * link-local / private networks. Use
 * {@link assertSafeServerFetchUrlResolved} against DNS rebinding.
 */
export function assertSafeServerFetchUrl(
  rawUrl: string,
  options: SafeFetchUrlOptions = {},
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SandboxPolicyError("invalid", "Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SandboxPolicyError("invalid", "URL must be http(s)");
  }
  if (options.requireHttps && url.protocol !== "https:") {
    throw new SandboxPolicyError("invalid", "URL must be https");
  }
  if (url.username || url.password) {
    throw new SandboxPolicyError("invalid", "URL credentials are not allowed");
  }

  const host = normalizeHost(url.hostname);
  if (!host) {
    throw new SandboxPolicyError("invalid", "URL host is required");
  }

  if (isLinkLocalOrMetadata(host) && !isLoopbackHost(host)) {
    throw new SandboxPolicyError(
      "egress_denied",
      "URL host is blocked (metadata/link-local)",
    );
  }

  const loopback = isLoopbackHost(host);
  if (loopback && !options.allowLoopback) {
    throw new SandboxPolicyError(
      "egress_denied",
      "Loopback URLs are not allowed",
    );
  }

  if (!loopback && isPrivateIpv4(host) && !options.allowPrivate) {
    throw new SandboxPolicyError(
      "egress_denied",
      "Private network URLs are not allowed",
    );
  }

  // IPv6 unique-local / unspecified
  if (
    (host.startsWith("fc") || host.startsWith("fd") || host === "::") &&
    !options.allowPrivate
  ) {
    throw new SandboxPolicyError(
      "egress_denied",
      "Private network URLs are not allowed",
    );
  }

  return url;
}

export function isSafeServerFetchUrl(
  rawUrl: string,
  options: SafeFetchUrlOptions = {},
): boolean {
  try {
    assertSafeServerFetchUrl(rawUrl, options);
    return true;
  } catch {
    return false;
  }
}

export type DnsLookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

/**
 * Hostname check + DNS resolution of all A/AAAA records. Rejects if any
 * resolved address is private/metadata/loopback (per options).
 */
export async function assertSafeServerFetchUrlResolved(
  rawUrl: string,
  options: SafeFetchUrlOptions & { lookup?: DnsLookupFn } = {},
): Promise<URL> {
  const url = assertSafeServerFetchUrl(rawUrl, options);
  const host = normalizeHost(url.hostname);

  if (isIpv4Literal(host) || host.includes(":")) {
    if (isResolvedAddressBlocked(host, options)) {
      throw new SandboxPolicyError(
        "egress_denied",
        `Resolved address ${host} is blocked`,
      );
    }
    return url;
  }

  const lookup =
    options.lookup ??
    (async (hostname: string) => {
      const dns = await import("node:dns/promises");
      return dns.lookup(hostname, { all: true, verbatim: true });
    });

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host);
  } catch {
    throw new SandboxPolicyError("invalid", "DNS lookup failed for URL host");
  }
  if (!records.length) {
    throw new SandboxPolicyError("invalid", "DNS lookup returned no addresses");
  }
  for (const rec of records) {
    if (isResolvedAddressBlocked(rec.address, options)) {
      throw new SandboxPolicyError(
        "egress_denied",
        `Resolved address ${rec.address} is blocked`,
      );
    }
  }
  return url;
}
