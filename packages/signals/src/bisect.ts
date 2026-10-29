/**
 * TASK091 — regression git-bisect helper (sandbox-only contract).
 * Does not shell out; callers execute under hard timeout.
 */

export type BisectPlan = {
  goodSha: string;
  badSha: string;
  reproCommand: string;
  maxSteps: number;
  timeoutMs: number;
};

export type BisectStep = {
  sha: string;
  command: string;
  stepIndex: number;
};

export const BISECT_HARD_TIMEOUT_MS = 15 * 60 * 1000;
export const BISECT_MAX_STEPS = 20;

/** Build a bounded bisect plan from a CI-failure style signal body. */
export function planRegressionBisect(input: {
  goodSha?: string | null;
  badSha: string;
  reproCommand?: string | null;
  timeoutMs?: number;
}): BisectPlan | null {
  if (!input.badSha || input.badSha.length < 7) return null;
  const good = input.goodSha?.trim() || null;
  if (!good || good.length < 7) return null;
  const repro =
    input.reproCommand?.trim() ||
    "echo 'set repro command from signal' && exit 1";
  return {
    goodSha: good,
    badSha: input.badSha,
    reproCommand: repro.slice(0, 2000),
    maxSteps: BISECT_MAX_STEPS,
    timeoutMs: Math.min(
      input.timeoutMs ?? BISECT_HARD_TIMEOUT_MS,
      BISECT_HARD_TIMEOUT_MS,
    ),
  };
}

/** Split repro command into argv (no shell — sandbox blocks `sh -c`). */
export function parseReproCommandArgv(reproCommand: string): string[] {
  const trimmed = reproCommand.trim();
  if (!trimmed) return ["false"];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts : ["false"];
}

/** Parse optional bisect hints from a CI-failure style signal body. */
export function parseRegressionBisectHints(body: string): {
  goodSha: string | null;
  badSha: string | null;
  reproCommand: string | null;
} {
  const goodSha =
    body.match(/^good:\s*([0-9a-f]{7,40})/im)?.[1]?.trim() ?? null;
  const badSha =
    body.match(/^bad:\s*([0-9a-f]{7,40})/im)?.[1]?.trim() ??
    body.match(/^head:\s*([0-9a-f]{7,40})/im)?.[1]?.trim() ??
    null;
  const reproCommand =
    body.match(/^repro:\s*(.+)$/im)?.[1]?.trim().slice(0, 2000) ?? null;
  return { goodSha, badSha, reproCommand };
}

/** Build a plan from signal body + optional last-green SHA override. */
export function planRegressionBisectFromSignal(input: {
  body: string;
  goodSha?: string | null;
  timeoutMs?: number;
}): BisectPlan | null {
  const hints = parseRegressionBisectHints(input.body);
  const good = input.goodSha?.trim() || hints.goodSha;
  const bad = hints.badSha;
  if (!bad) return null;
  return planRegressionBisect({
    goodSha: good,
    badSha: bad,
    reproCommand: hints.reproCommand,
    timeoutMs: input.timeoutMs,
  });
}

/** Midpoint SHA placeholder list for Fake/sandbox harness (deterministic). */
export function fakeBisectSteps(plan: BisectPlan): BisectStep[] {
  const steps: BisectStep[] = [];
  for (let i = 0; i < Math.min(3, plan.maxSteps); i++) {
    steps.push({
      sha: `${plan.badSha.slice(0, 6)}_mid_${i}`,
      command: plan.reproCommand,
      stepIndex: i,
    });
  }
  return steps;
}
