/**
 * Signal / worker SLO helpers (TASK125) — burn rate for on-call.
 */

export const SIGNAL_SLOS = {
  /** Successful ingest+normalize (non-5xx) over rolling window. */
  ingestSuccessRate: 0.995,
  /** Auto-arm p95 latency target (ms). */
  armP95Ms: 5_000,
  /** Worker claim→finish lag p95 target (ms). */
  workerLagP95Ms: 30_000,
} as const;

export type SloBurnInput = {
  /** Observed success rate 0..1 (ingest). */
  ingestSuccessRate?: number;
  /** Observed arm p95 ms. */
  armP95Ms?: number;
  /** Observed worker lag p95 ms. */
  workerLagP95Ms?: number;
};

export type SloBurnResult = {
  burning: boolean;
  breaches: Array<{
    slo: keyof typeof SIGNAL_SLOS;
    target: number;
    observed: number;
  }>;
};

/** True when any observed metric violates SIGNAL_SLOS. */
export function evaluateSloBurn(input: SloBurnInput): SloBurnResult {
  const breaches: SloBurnResult["breaches"] = [];

  if (
    typeof input.ingestSuccessRate === "number" &&
    input.ingestSuccessRate < SIGNAL_SLOS.ingestSuccessRate
  ) {
    breaches.push({
      slo: "ingestSuccessRate",
      target: SIGNAL_SLOS.ingestSuccessRate,
      observed: input.ingestSuccessRate,
    });
  }
  if (
    typeof input.armP95Ms === "number" &&
    input.armP95Ms > SIGNAL_SLOS.armP95Ms
  ) {
    breaches.push({
      slo: "armP95Ms",
      target: SIGNAL_SLOS.armP95Ms,
      observed: input.armP95Ms,
    });
  }
  if (
    typeof input.workerLagP95Ms === "number" &&
    input.workerLagP95Ms > SIGNAL_SLOS.workerLagP95Ms
  ) {
    breaches.push({
      slo: "workerLagP95Ms",
      target: SIGNAL_SLOS.workerLagP95Ms,
      observed: input.workerLagP95Ms,
    });
  }

  return { burning: breaches.length > 0, breaches };
}
