/**
 * Client-safe Open Program replan idle helpers.
 * Keep in sync with `@coppergate/db` `mission-control-replan.ts`.
 * Do not import `@coppergate/db` from "use client" modules.
 */

const REPLAN_ARCHITECTURE_IDLE_REASONS = new Set([
  "no_architecture_open_id",
  "architecture_ids_in_flight",
]);

export function isReplanArchitectureIdleReason(
  reason: string | null | undefined,
): boolean {
  if (!reason?.trim()) return false;
  return REPLAN_ARCHITECTURE_IDLE_REASONS.has(reason.trim());
}

export function replanSkipReasonFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || meta.skipped !== true) return null;
  const reason = meta.reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

export function isReplanQueueArchitectureIdleMeta(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false;
  const reason = meta.reason;
  if (typeof reason === "string" && isReplanArchitectureIdleReason(reason)) {
    return true;
  }
  const err = meta.error;
  if (typeof err === "string" && isReplanArchitectureIdleReason(err.trim())) {
    return true;
  }
  return false;
}

export function replanArchitectureIdleCopy(
  reason: string,
  opts?: { projectLabel?: string | null; inFlightCount?: number | null },
): { title: string; detail: string; ctaLabel: string } {
  const projectSuffix = opts?.projectLabel?.trim()
    ? ` · ${opts.projectLabel.trim()}`
    : "";
  if (reason === "architecture_ids_in_flight") {
    const n = opts?.inFlightCount;
    const detail =
      n != null && n > 0
        ? `${n} architecture ID${n === 1 ? "" : "s"} already on the board — wait for current deliveries before the next replan.`
        : "Architecture IDs are already in flight — wait for current deliveries before the next replan.";
    return {
      title: `Open Program in flight${projectSuffix}`,
      detail,
      ctaLabel: "View backlog",
    };
  }
  return {
    title: `Open Program idle${projectSuffix}`,
    detail:
      "No open architecture ID on the bound program — add or reopen a row in OPEN_PROGRAM.md, then replan.",
    ctaLabel: "Open backlog",
  };
}
