/**
 * TASK125 — observability SLO targets (ops runbook constants).
 */

export const SIGNAL_SLOS = {
  /** Ingest normalize+persist success rate over 30d. */
  ingestSuccessRatio: 0.995,
  /** p95 arm latency from webhook receive → task created (ms). */
  armLatencyP95Ms: 5_000,
  /** Worker claim lag p95 (ms). */
  workerLagP95Ms: 30_000,
  /** Error budget burn alert window (hours). */
  burnAlertHours: 1,
} as const;

export type SloBurnInput = {
  successCount: number;
  totalCount: number;
  targetRatio: number;
};

/** True when observed success ratio is below SLO (page-worthy). */
export function isSloBurning(input: SloBurnInput): boolean {
  if (input.totalCount < 20) return false;
  const ratio = input.successCount / input.totalCount;
  return ratio < input.targetRatio;
}
