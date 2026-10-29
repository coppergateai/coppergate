export type MissionControlAttentionKind =
  | "approval"
  | "budget_paused"
  | "budget_reserved"
  | "provider_quota"
  | "review_required"
  | "arena_failed"
  | "replan_failed"
  /** Expected Open Program idle — not a maintainer failure (AG-015). */
  | "replan_idle"
  /** Bound program markdown unreachable — no invent (AG-020). */
  | "architecture_fetch_failed"
  | "merge_blocked"
  /** Default-branch CI ship gate — auto-merge halted until tip is green. */
  | "ship_gate_halted"
  | "concurrency";

export type MissionControlAttentionItem = {
  id: string;
  kind: MissionControlAttentionKind;
  title: string;
  detail: string;
  href: string;
  priority: "high" | "normal";
  ctaLabel?: string;
};

/** Crisis kinds lead the list — stop burn before triage (P-101). */
export function missionControlAttentionKindRank(
  kind: MissionControlAttentionKind,
): number {
  switch (kind) {
    case "concurrency":
      return 0;
    case "provider_quota":
      return 1;
    case "merge_blocked":
      return 2;
    case "ship_gate_halted":
      return 2;
    default:
      return 3;
  }
}

export function sortMissionControlAttention(
  attention: MissionControlAttentionItem[],
): void {
  attention.sort((a, b) => {
    const ra = missionControlAttentionKindRank(a.kind);
    const rb = missionControlAttentionKindRank(b.kind);
    if (ra !== rb) return ra - rb;
    if (a.priority === b.priority) return 0;
    return a.priority === "high" ? -1 : 1;
  });
}
