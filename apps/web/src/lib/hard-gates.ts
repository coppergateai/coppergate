/** Shared Accept / Evidence / Arena hard-gate copy (Faz 2). */

export type GateStatus = "passed" | "failed" | "pending" | "skipped" | "n/a";

export const HARD_GATE_COPY = {
  ciFailed: "CI checks failed — Accept disabled",
  ciPending: "Awaiting live CI evidence — Accept disabled",
  validationFailed: "Sandbox validation failed — fix scope or Retry",
  policyFailed: "Policy blocked this delivery — Accept disabled",
  allHardPassed: "All required gates passed",
  humanStillRequired: "Human review still required",
} as const;

export function gateStatusLabel(status: GateStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "skipped":
      return "Skipped";
    default:
      return "N/A";
  }
}

export function acceptBlockedReason(input: {
  acceptReady: boolean;
  ciBlocking: boolean;
  ciAwaitingLive: boolean;
  ciPassed: boolean;
  validationFailed?: boolean;
  policyFailed?: boolean;
}): string | null {
  if (input.acceptReady) return null;
  if (input.policyFailed) return HARD_GATE_COPY.policyFailed;
  if (input.validationFailed) return HARD_GATE_COPY.validationFailed;
  if (input.ciBlocking) return HARD_GATE_COPY.ciFailed;
  if (input.ciAwaitingLive && !input.ciPassed) return HARD_GATE_COPY.ciPending;
  return HARD_GATE_COPY.ciPending;
}
