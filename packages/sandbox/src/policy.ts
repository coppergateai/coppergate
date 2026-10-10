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
