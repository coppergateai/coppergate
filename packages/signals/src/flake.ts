/**
 * TASK090 / AG-021 — flaky test hunter heuristics (cooldown / pattern).
 * Returns true when the same CI name failed then passed (or vice versa)
 * within a short window — callers should avoid infinite re-arm / Retry thrash.
 */

/** Default oscillation window — also used as arm/Retry cooldown. */
export const FLAKE_COOLDOWN_WINDOW_MS = 30 * 60_000;

export type FlakeObservation = {
  name: string;
  conclusion: string;
  at: number;
};

export function detectFlakePattern(
  history: FlakeObservation[],
  opts?: { windowMs?: number; name?: string; nowMs?: number },
): { flaky: boolean; reason?: string } {
  const windowMs = opts?.windowMs ?? FLAKE_COOLDOWN_WINDOW_MS;
  const now = opts?.nowMs ?? Date.now();
  const relevant = history
    .filter((h) => (!opts?.name || h.name === opts.name) && now - h.at <= windowMs)
    .sort((a, b) => a.at - b.at);
  if (relevant.length < 2) return { flaky: false };

  const conclusions = relevant.map((h) => h.conclusion.toLowerCase());
  const hasFail = conclusions.some(
    (c) =>
      c === "failure" ||
      c === "timed_out" ||
      c === "cancelled" ||
      c === "action_required" ||
      c === "error",
  );
  const hasPass = conclusions.some(
    (c) => c === "success" || c === "neutral" || c === "passed",
  );
  if (hasFail && hasPass) {
    const checkName = opts?.name ?? relevant[0]!.name;
    return {
      flaky: true,
      reason: `flake_pattern:${checkName}`,
    };
  }
  return { flaky: false };
}

/** AG-021 — suppress auto-arm / Retry while oscillation is in window. */
export function shouldSuppressFlakeRetry(
  history: FlakeObservation[],
  opts?: { windowMs?: number; name?: string; nowMs?: number },
): { suppress: boolean; reason?: string } {
  const detected = detectFlakePattern(history, opts);
  if (!detected.flaky) return { suppress: false };
  return {
    suppress: true,
    reason: detected.reason ?? "flake_cooldown",
  };
}
