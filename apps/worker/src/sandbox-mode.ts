/**
 * SEC-037 — sandbox mode policy.
 * `local` spawns agent/repo commands on the worker host (command-name denylist
 * only, host network). In production it fails closed unless the operator sets
 * the explicit break-glass ack `ALLOW_LOCAL_SANDBOX=1`.
 */
export type SandboxMode = "local" | "docker" | "off";

export const SANDBOX_LOCAL_FORBIDDEN_CODE = "sandbox_local_forbidden";

type Env = Record<string, string | undefined>;

export function resolveSandboxMode(env: Env = process.env): SandboxMode {
  const raw = (env.SANDBOX_MODE ?? "local").trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "docker" || raw === "gvisor" || raw === "docker-gvisor") {
    return "docker";
  }
  return "local";
}

export type SandboxModePolicy =
  | { mode: SandboxMode; allowed: true; breakGlass: boolean }
  | {
      mode: SandboxMode;
      allowed: false;
      errorCode: typeof SANDBOX_LOCAL_FORBIDDEN_CODE;
      message: string;
    };

export function evaluateSandboxModePolicy(env: Env = process.env): SandboxModePolicy {
  const mode = resolveSandboxMode(env);
  if (mode !== "local" || env.NODE_ENV !== "production") {
    return { mode, allowed: true, breakGlass: false };
  }
  if (env.ALLOW_LOCAL_SANDBOX?.trim() === "1") {
    return { mode, allowed: true, breakGlass: true };
  }
  return {
    mode,
    allowed: false,
    errorCode: SANDBOX_LOCAL_FORBIDDEN_CODE,
    message:
      "SANDBOX_MODE=local is refused in production (host spawn, host network). Set SANDBOX_MODE=docker, or ALLOW_LOCAL_SANDBOX=1 to accept host execution explicitly.",
  };
}
