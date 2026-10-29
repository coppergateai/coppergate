/**
 * AG-021 — defer human Retry and unattended heal/replan while required CI flaps.
 * Uses @coppergate/signals detectFlakePattern (TASK090).
 */

import {
  detectFlakePattern,
  type FlakeObservation,
} from "@coppergate/signals";
import type { CiCheckHistoryEntry } from "./ci-waiting-honesty.js";

/** Align with detectFlakePattern default window and auto-merge backoff. */
export const FLAKE_RETRY_COOLDOWN_MS = 30 * 60_000;

/** Audit actions that count as a retry/heal arm for cooldown. */
export const FLAKE_RETRY_COOLDOWN_ACTIONS = [
  "task.retry",
  "review.stale_ci_timeout_heal",
  "review.stale_ci_timeout_replan",
] as const;

export function ciHistoryToFlakeObservations(
  history: CiCheckHistoryEntry[],
): FlakeObservation[] {
  return history.map((h) => ({
    name: h.name,
    conclusion: normalizeCiConclusion(h),
    at: h.at.getTime(),
  }));
}

function normalizeCiConclusion(entry: CiCheckHistoryEntry): string {
  if (entry.conclusion?.trim()) return entry.conclusion.trim();
  return entry.passed ? "success" : "failure";
}

export type FlakeRetryDeferral = {
  defer: boolean;
  flaky: boolean;
  reason?: string;
  retryAfterMs?: number;
};

/**
 * When CI oscillates pass/fail, block another Retry or unattended heal until
 * cooldown elapses since the last retry/heal audit on the task.
 */
export function evaluateFlakeRetryDeferral(input: {
  checkHistory: CiCheckHistoryEntry[];
  lastRetryOrHealAt: Date | null;
  nowMs?: number;
  windowMs?: number;
  cooldownMs?: number;
}): FlakeRetryDeferral {
  const nowMs = input.nowMs ?? Date.now();
  const windowMs = input.windowMs ?? FLAKE_RETRY_COOLDOWN_MS;
  const cooldownMs = input.cooldownMs ?? FLAKE_RETRY_COOLDOWN_MS;
  const observations = ciHistoryToFlakeObservations(input.checkHistory);
  const pattern = detectFlakePattern(observations, { windowMs, nowMs });
  if (!pattern.flaky) {
    return { defer: false, flaky: false };
  }

  const lastMs = input.lastRetryOrHealAt?.getTime();
  if (lastMs == null || !Number.isFinite(lastMs)) {
    return { defer: false, flaky: true, reason: pattern.reason };
  }

  const elapsed = nowMs - lastMs;
  if (elapsed < cooldownMs) {
    return {
      defer: true,
      flaky: true,
      reason: pattern.reason ?? "flake_cooldown",
      retryAfterMs: cooldownMs - elapsed,
    };
  }

  return { defer: false, flaky: true, reason: pattern.reason };
}

export function flakeRetryBlockedMessage(retryAfterMs?: number): string {
  const mins =
    retryAfterMs != null && retryAfterMs > 0
      ? Math.max(1, Math.ceil(retryAfterMs / 60_000))
      : FLAKE_RETRY_COOLDOWN_MS / 60_000;
  return `Required CI is flaking — wait ~${mins}m for checks to stabilize before Retry.`;
}
