import type { Logger } from "./logger.js";

/**
 * PRODUCT §13 + GTM Phase 0 funnel stages.
 * Landing → connect → brief|issue → task → PR → accept → second PR / paid.
 */
export type FunnelStage =
  | "landing_visit"
  | "github_connected"
  | "brief_approved"
  | "issue_imported"
  | "task_started"
  | "pr_opened"
  | "pr_accepted"
  | "second_pr_accepted"
  | "invite_redeemed"
  | "paid_pilot_started"
  | "checkout_completed";

export type FunnelEventInput = {
  stage: FunnelStage;
  workspaceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  userId?: string | null;
  /** Non-secret extras (repo full name ok; never tokens). */
  meta?: Record<string, unknown>;
};

/** Emit a structured funnel event for log/metrics pipelines. */
export function trackFunnelEvent(
  log: Logger,
  input: FunnelEventInput,
): void {
  log.info("funnel", {
    event: "funnel",
    funnel_stage: input.stage,
    workspaceId: input.workspaceId ?? undefined,
    projectId: input.projectId ?? undefined,
    taskId: input.taskId ?? undefined,
    runId: input.runId ?? undefined,
    userId: input.userId ?? undefined,
    ...(input.meta ?? {}),
  });
}

export const FUNNEL_STAGES: readonly FunnelStage[] = [
  "landing_visit",
  "github_connected",
  "brief_approved",
  "issue_imported",
  "task_started",
  "pr_opened",
  "pr_accepted",
  "second_pr_accepted",
  "invite_redeemed",
  "paid_pilot_started",
  "checkout_completed",
] as const;
