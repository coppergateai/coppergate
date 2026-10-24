import {
  METADATA_IPV4,
  SandboxPolicyError,
  assertEgressAllowed,
} from "./policy.js";

/** Cloud metadata / IMDS hostnames (matched anywhere in argv). */
const METADATA_HOST_RE =
  /metadata\.google\.internal|metadata\.goog(?:le)?(?:\.|$)|instance-data\.ec2\.internal|kubernetes\.default(?:\.svc)?/i;

/** Block metadata / private / non-allowlisted hosts in command argv. */
export function assertSandboxCommandArgs(command: readonly string[]): void {
  for (const arg of command) {
    if (typeof arg !== "string") continue;
    if (arg.includes(METADATA_IPV4) || /169\.254\.\d+\.\d+/.test(arg)) {
      throw new SandboxPolicyError(
        "egress_denied",
        "Cannot reach cloud metadata IP from sandbox",
      );
    }
    if (METADATA_HOST_RE.test(arg)) {
      throw new SandboxPolicyError(
        "egress_denied",
        "Cannot reach cloud metadata / cluster DNS host from sandbox",
      );
    }
    const ipv4s = arg.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
    for (const ip of ipv4s) {
      if (
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
        ip.startsWith("127.") ||
        ip === "0.0.0.0" ||
        ip.startsWith("169.254.")
      ) {
        throw new SandboxPolicyError(
          "egress_denied",
          `Egress to private/link-local IP ${ip} is blocked`,
        );
      }
    }
    // Any http(s) URL in the arg (not only leading) — covers shell -c wrappers.
    for (const match of arg.matchAll(/https?:\/\/\[?([^\]/\s"'`]+)/gi)) {
      const host = match[1]?.split(":")[0]?.trim();
      if (host) assertEgressAllowed(host);
    }
  }
}
