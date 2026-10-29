import { basename } from "node:path";
import { assertProductionDeployAllowed } from "@coppergate/scm";
import {
  METADATA_IPV4,
  SandboxPolicyError,
  assertEgressAllowed,
} from "./policy.js";

/** Cloud metadata / IMDS hostnames (matched anywhere in argv). */
const METADATA_HOST_RE =
  /metadata\.google\.internal|metadata\.goog(?:le)?(?:\.|$)|instance-data\.ec2\.internal|kubernetes\.default(?:\.svc)?/i;

/** Network clients — blocked in sandbox (local shares host network). */
const DENIED_NETWORK_BINARIES = new Set([
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "nmap",
  "ssh",
  "scp",
  "sftp",
  "ftp",
  "telnet",
  "dig",
  "nslookup",
  "host",
]);

const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/** Production deploy verbs blocked unless arena prod_writes_enabled (SEC-036). */
const PROD_DEPLOY_BINARIES = new Set([
  "fly",
  "flyctl",
  "vercel",
  "railway",
  "render",
  "kubectl",
  "helm",
  "terraform",
  "pulumi",
  "serverless",
  "sam",
  "cdk",
  "eb",
  "gcloud",
  "aws",
  "az",
]);

function looksLikeProductionDeploy(command: readonly string[]): boolean {
  const bin = commandBasename(command);
  if (PROD_DEPLOY_BINARIES.has(bin)) {
    if (bin === "vercel") {
      return command.some(
        (a) => typeof a === "string" && /--prod(?:uction)?\b/.test(a),
      );
    }
    if (bin === "aws") {
      const joined = command.join(" ").toLowerCase();
      return /\b(deploy|cloudformation)\b/.test(joined);
    }
    if (bin === "gcloud") {
      return command.some(
        (a) => typeof a === "string" && /\b(app|run)\b/.test(a),
      );
    }
    if (bin === "az") {
      return command.some((a) => typeof a === "string" && /\bwebapp\b/.test(a));
    }
    if (bin === "terraform" || bin === "pulumi") {
      return command.some((a) => typeof a === "string" && a === "apply");
    }
    if (bin === "kubectl") {
      return command.some(
        (a) => typeof a === "string" && /\b(apply|rollout)\b/.test(a),
      );
    }
    if (bin === "helm") {
      return command.some((a) => typeof a === "string" && a === "upgrade");
    }
    // fly deploy, railway up, render deploy, serverless deploy, etc.
    return command.some(
      (a) =>
        typeof a === "string" &&
        /^(deploy|up|push|release|sync)$/i.test(a.trim()),
    );
  }
  return false;
}

/** Interpreter eval flags that enable arbitrary code / hidden egress. */
const INTERPRETER_EVAL_FLAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["node", new Set(["-e", "--eval", "-p", "--print"])],
  ["nodejs", new Set(["-e", "--eval", "-p", "--print"])],
  ["python", new Set(["-c"])],
  ["python3", new Set(["-c"])],
  ["ruby", new Set(["-e"])],
  ["perl", new Set(["-e"])],
  ["php", new Set(["-r"])],
  ["lua", new Set(["-e"])],
]);

function commandBasename(command: readonly string[]): string {
  const raw = command[0]?.trim() ?? "";
  return basename(raw).toLowerCase();
}

/**
 * Deny risky binaries / eval modes, then scan argv for metadata / private /
 * non-allowlisted hosts.
 */
export function assertSandboxCommandArgs(
  command: readonly string[],
  opts?: { prodWritesEnabled?: boolean },
): void {
  if (!command.length) {
    throw new SandboxPolicyError("invalid", "command required");
  }

  if (looksLikeProductionDeploy(command)) {
    try {
      assertProductionDeployAllowed({
        prodWritesEnabled: opts?.prodWritesEnabled === true,
      });
    } catch (err) {
      throw new SandboxPolicyError(
        "egress_denied",
        err instanceof Error
          ? err.message
          : "Production deploy blocked without prodWritesEnabled",
      );
    }
  }

  const bin = commandBasename(command);
  if (DENIED_NETWORK_BINARIES.has(bin)) {
    throw new SandboxPolicyError(
      "egress_denied",
      `Network tool ${bin} is blocked in sandbox`,
    );
  }

  if (
    SHELL_BINARIES.has(bin) &&
    command.slice(1).some((a) => a === "-c" || a === "-lc")
  ) {
    throw new SandboxPolicyError(
      "egress_denied",
      "Shell -c is blocked in sandbox",
    );
  }

  const evalFlags = INTERPRETER_EVAL_FLAGS.get(bin);
  if (evalFlags) {
    for (const arg of command.slice(1)) {
      if (typeof arg === "string" && evalFlags.has(arg)) {
        throw new SandboxPolicyError(
          "egress_denied",
          `Interpreter eval flag ${arg} is blocked in sandbox`,
        );
      }
    }
  }

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
    // Any http(s) URL in the arg (not only leading) — covers wrappers.
    for (const match of arg.matchAll(/https?:\/\/\[?([^\]/\s"'`]+)/gi)) {
      const host = match[1]?.split(":")[0]?.trim();
      if (host) assertEgressAllowed(host);
    }
  }
}
