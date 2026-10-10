import type { Logger } from "./logger.js";

/**
 * PRODUCT §13 funnel stages — north-star components for private beta.
 * Landing visit → GitHub connected → brief approved → first task started →
 * first PR opened → first PR accepted.
 */
export type FunnelStage =
  | "landing_visit"
  | "github_connected"
  | "brief_approved"
  | "task_started"
  | "pr_opened"
  | "pr_accepted";

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
  "task_started",
  "pr_opened",
  "pr_accepted",
] as const;
