import { DEFAULT_LIMITS, SandboxPolicyError } from "./policy.js";

export type SandboxExecTimeoutOptions = {
  timeoutMs?: number;
  /** Wall-clock ms (Date.now) — exec refuses when elapsed. */
  hardDeadlineMs?: number;
};

/**
 * Resolve per-exec timeout honoring an optional hard deadline (AG-023 bisect budget).
 */
export function resolveSandboxExecTimeoutMs(
  options: SandboxExecTimeoutOptions | undefined,
  now = Date.now(),
  defaultMs: number = DEFAULT_LIMITS.wallClockMs,
): number {
  let timeoutMs = options?.timeoutMs ?? defaultMs;
  if (options?.hardDeadlineMs != null) {
    const remaining = options.hardDeadlineMs - now;
    if (remaining <= 0) {
      throw new SandboxPolicyError(
        "timeout",
        "sandbox exec hard deadline elapsed",
      );
    }
    timeoutMs = Math.min(timeoutMs, remaining);
  }
  return timeoutMs;
}
