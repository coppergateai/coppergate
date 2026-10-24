import {
  METADATA_IPV4,
  SandboxPolicyError,
  assertEgressAllowed,
} from "./policy.js";

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
    const urlHost = arg.match(/^https?:\/\/([^/:]+)/i)?.[1];
    if (urlHost) {
      assertEgressAllowed(urlHost);
    }
  }
}
