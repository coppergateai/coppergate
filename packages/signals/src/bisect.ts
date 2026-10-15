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
