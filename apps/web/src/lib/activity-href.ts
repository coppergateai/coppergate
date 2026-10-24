/**
 * Deep-link targets for workspace audit / activity events.
 * Keep API, Mission Control, and Activity page in sync via this helper.
 */
export function activityHref(
  workspaceId: string,
  action: string,
  meta: Record<string, unknown> | null,
  targetType: string | null,
  targetId: string | null,
): string | null {
  const projectId =
    typeof meta?.projectId === "string" ? meta.projectId : null;
  const taskId = typeof meta?.taskId === "string" ? meta.taskId : null;

  // Action-specific targets before generic project/task fallbacks.
  if (
    action.startsWith("arena.") ||
    action.startsWith("tournament.") ||
    action === "contender.eliminated" ||
    action === "contender.debit" ||
    action === "fitness.score"
  ) {
    return projectId
      ? `/workspaces/${workspaceId}/arena?focus=${encodeURIComponent(projectId)}`
      : `/workspaces/${workspaceId}/arena`;
  }
  if (action.startsWith("signal.") || action.startsWith("credentials.")) {
    const tab = action.startsWith("credentials.") ? "llm" : "signals";
    return `/workspaces/${workspaceId}/settings?tab=${tab}`;
  }
  if (action.startsWith("mcp.")) {
    return `/workspaces/${workspaceId}/settings?tab=llm`;
  }
  if (action === "maintainer.replan_queue_failed") {
    if (projectId) {
      return `/workspaces/${workspaceId}/projects/${projectId}`;
    }
    return `/workspaces/${workspaceId}/activity`;
  }
  if (action === "merge.blocked" || action === "merge.blocked_cleared") {
    return projectId
      ? `/workspaces/${workspaceId}/projects/${projectId}?tab=configuration`
      : `/workspaces/${workspaceId}/activity`;
  }

  if (taskId && projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`;
  }
  if (projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}`;
  }
  if (targetType === "project" && targetId) {
    return `/workspaces/${workspaceId}/projects/${targetId}`;
  }
  if (targetType === "task" && targetId && projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}/tasks/${targetId}`;
  }
  return null;
}
