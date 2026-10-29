import type { MissionControlAttentionItem } from "./mission-control-attention.js";

/** Maintainer replan skips — expected idle, not ops failure (AG-015). */
export const REPLAN_ARCHITECTURE_IDLE_REASONS = new Set([
  "no_architecture_open_id",
  "architecture_ids_in_flight",
]);

/** Program-bound fetch could not load markdown — do not invent (AG-020). */
export const REPLAN_ARCHITECTURE_FETCH_FAILED_REASON =
  "architecture_fetch_failed";

export function isReplanArchitectureFetchFailedReason(
  reason: string | null | undefined,
): boolean {
  return reason?.trim() === REPLAN_ARCHITECTURE_FETCH_FAILED_REASON;
}

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

export type ReplanArchitectureIdleCopy = {
  title: string;
  detail: string;
  ctaLabel: string;
};

/** Human copy for Mission Control attention rows (calm idle, not failure). */
export function replanArchitectureIdleCopy(
  reason: string,
  opts?: { projectLabel?: string | null; inFlightCount?: number | null },
): ReplanArchitectureIdleCopy {
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

export function missionControlArchitectureFetchFailedItem(input: {
  dedupeKey: string;
  workspaceId: string;
  projectId: string | null;
  projectLabel?: string | null;
  fetchError?: string | null;
}): MissionControlAttentionItem {
  const projectSuffix = input.projectLabel?.trim()
    ? ` · ${input.projectLabel.trim()}`
    : "";
  const errBit = input.fetchError?.trim()
    ? ` (${input.fetchError.trim().replace(/_/g, " ")})`
    : "";
  const href = input.projectId
    ? `/workspaces/${input.workspaceId}/projects/${input.projectId}?tab=configuration#open-program-bind`
    : `/workspaces/${input.workspaceId}/settings?tab=integrations`;
  return {
    id: `architecture-fetch-${input.dedupeKey}`,
    kind: "architecture_fetch_failed",
    title: `Open Program fetch failed${projectSuffix}`,
    detail: `Bad GitHub token or missing Program path — maintainer will not invent backlog tasks${errBit}. Re-bind architectureRepo and Program path on Configuration.`,
    href,
    priority: "normal",
    ctaLabel: "Re-bind Program path",
  };
}

export function missionControlReplanIdleItem(input: {
  dedupeKey: string;
  workspaceId: string;
  projectId: string | null;
  reason: string;
  projectLabel?: string | null;
  excludeIds?: unknown;
}): MissionControlAttentionItem {
  const excludeIds = Array.isArray(input.excludeIds)
    ? input.excludeIds.filter((x): x is string => typeof x === "string")
    : [];
  const copy = replanArchitectureIdleCopy(input.reason, {
    projectLabel: input.projectLabel,
    inFlightCount: excludeIds.length > 0 ? excludeIds.length : null,
  });
  const href = input.projectId
    ? `/workspaces/${input.workspaceId}/backlog`
    : `/workspaces/${input.workspaceId}/backlog`;
  return {
    id: `replan-idle-${input.dedupeKey}`,
    kind: "replan_idle",
    title: copy.title,
    detail: copy.detail,
    href,
    priority: "normal",
    ctaLabel: copy.ctaLabel,
  };
}
