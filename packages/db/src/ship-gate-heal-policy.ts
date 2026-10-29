/**
 * AG-031 — pure ship-gate heal policy (no DB imports; safe for spend-license).
 */

/** Marker in task titles — also the spend-license bypass key. */
export const SHIP_GATE_HEAL_MARKER = "[ship-gate]";

/** True when title is a system ship-gate heal (tip CI repair). */
export function isShipGateHealTitle(
  title: string | null | undefined,
): boolean {
  if (!title) return false;
  return title.toLowerCase().includes(SHIP_GATE_HEAL_MARKER);
}

/**
 * Auto-merge posture while the default-branch ship gate is evaluated.
 *
 * - `all` — tip green, no open rollback: normal product merges
 * - `heal_only` — tip red: land `[ship-gate]` heal PRs only (AG-034). Without
 *   this, AG-031 enqueue deadlocks (heal PR green but merge never runs).
 * - `halt` — tip pending or open ship-rollback: merge nothing
 */
export type ShipGateMergeMode = "all" | "heal_only" | "halt";

export function shipGateMergeMode(input: {
  tipKind: "green" | "red" | "pending";
  openRollbacks: number;
}): ShipGateMergeMode {
  if (input.openRollbacks > 0) return "halt";
  if (input.tipKind === "green") return "all";
  if (input.tipKind === "red") return "heal_only";
  return "halt";
}

/** Build a stable heal title for a tip SHA (dedupe by marker + short sha). */
export function buildShipGateHealTitle(headSha: string): string {
  const short = headSha.trim().slice(0, 8) || "unknown";
  return `${SHIP_GATE_HEAL_MARKER} Fix default-branch CI (${short})`.slice(
    0,
    200,
  );
}

/**
 * REVIEW_REQUIRED after waiting_ci_timeout without accept-ready must not
 * block continuous backlog — otherwise one timed-out review freezes replan.
 */
export function openTaskCountsAsBusyForBacklog(input: {
  status: string;
  hasWaitingCiTimeout: boolean;
  acceptReady: boolean;
}): boolean {
  if (input.status === "REVIEW_REQUIRED") {
    if (input.hasWaitingCiTimeout && !input.acceptReady) return false;
  }
  return true;
}

/** Stale non-accept-ready review after CI timeout — free the board. */
export const STALE_REVIEW_AFTER_CI_TIMEOUT_MS = 30 * 60_000;

/**
 * Dirty / salvageable delivery PRs should heal without waiting the full
 * WAITING_CI timeout (default 6h) — otherwise Arena looks “stuck” and asks
 * a human (AG-035).
 */
export const DIRTY_PR_HEAL_GRACE_MS = 15 * 60_000;

export function shouldRequestChangesForStaleCiTimeoutReview(input: {
  taskStatus: string;
  acceptReady: boolean;
  hasWaitingCiTimeout: boolean;
  taskUpdatedAt: Date;
  nowMs?: number;
  staleMs?: number;
}): boolean {
  if (input.taskStatus !== "REVIEW_REQUIRED") return false;
  if (input.acceptReady) return false;
  if (!input.hasWaitingCiTimeout) return false;
  const stale = input.staleMs ?? STALE_REVIEW_AFTER_CI_TIMEOUT_MS;
  const now = input.nowMs ?? Date.now();
  return now - input.taskUpdatedAt.getTime() >= stale;
}

/** True when an open delivery has been WAITING_CI / REVIEW long enough to poll PR merge state. */
export function shouldInspectDeliveryPrForUnattendedHeal(input: {
  taskStatus: string;
  acceptReady: boolean;
  taskUpdatedAt: Date;
  nowMs?: number;
  graceMs?: number;
}): boolean {
  if (input.acceptReady) return false;
  if (
    input.taskStatus !== "WAITING_CI" &&
    input.taskStatus !== "REVIEW_REQUIRED"
  ) {
    return false;
  }
  const grace = input.graceMs ?? DIRTY_PR_HEAL_GRACE_MS;
  const now = input.nowMs ?? Date.now();
  return now - input.taskUpdatedAt.getTime() >= grace;
}

/**
 * Tip already green (or heal PR closed/merged) → retire open `[ship-gate]`
 * REVIEW/WAITING work so Mission Control stops asking a human.
 */
export function shouldRetireObsoleteShipGateHeal(input: {
  taskTitle: string | null | undefined;
  tipKind?: "green" | "red" | "pending" | null;
  prOpen?: boolean | null;
  prMerged?: boolean | null;
}): boolean {
  if (!isShipGateHealTitle(input.taskTitle)) return false;
  if (input.tipKind === "green") return true;
  if (input.prMerged === true) return true;
  if (input.prOpen === false) return true;
  return false;
}
