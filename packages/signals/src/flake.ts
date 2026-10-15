/**
 * TASK090 — flaky test hunter heuristics (cooldown / pattern).
 * Returns true when the same CI name failed then passed (or vice versa)
 * within a short window — callers should avoid infinite re-arm.
 */

export type FlakeObservation = {
  name: string;
  conclusion: string;
  at: number;
};

export function detectFlakePattern(
  history: FlakeObservation[],
  opts?: { windowMs?: number; name?: string },
): { flaky: boolean; reason?: string } {
  const windowMs = opts?.windowMs ?? 30 * 60_000;
  const now = Date.now();
  const relevant = history
    .filter((h) => (!opts?.name || h.name === opts.name) && now - h.at <= windowMs)
    .sort((a, b) => a.at - b.at);
  if (relevant.length < 2) return { flaky: false };

  const conclusions = relevant.map((h) => h.conclusion.toLowerCase());
  const hasFail = conclusions.some(
    (c) => c === "failure" || c === "timed_out",
  );
  const hasPass = conclusions.some((c) => c === "success");
  if (hasFail && hasPass) {
    return {
      flaky: true,
      reason: `flake_pattern:${relevant[0]!.name}`,
    };
  }
  return { flaky: false };
}
