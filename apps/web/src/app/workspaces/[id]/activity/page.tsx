import { notFound, redirect } from "next/navigation";
import {
  getTaskForWorkspace,
  getWorkspaceForMember,
  getWorkspaceMissionControl,
  listAuditEventsForWorkspace,
  listWorkspaceArenaSnapshot,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActivityShell } from "./activity-shell";
import type { ActivityEvent } from "./events";
import { countEventsToday } from "./events";

type PageProps = { params: Promise<{ id: string }> };

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hrefFor(
  workspaceId: string,
  action: string,
  meta: Record<string, unknown> | null,
  targetType: string | null,
  targetId: string | null,
): string | null {
  const projectId =
    typeof meta?.projectId === "string" ? meta.projectId : null;
  const taskId = typeof meta?.taskId === "string" ? meta.taskId : null;
  if (taskId && projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`;
  }
  if (projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}`;
  }
  if (targetType === "project" && targetId) {
    return `/workspaces/${workspaceId}/projects/${targetId}`;
  }
  if (action.startsWith("signal.") || action.startsWith("credentials.")) {
    const tab = action.startsWith("credentials.") ? "llm" : "signals";
    return `/workspaces/${workspaceId}/settings?tab=${tab}`;
  }
  if (action.startsWith("mcp.")) {
    return `/workspaces/${workspaceId}/settings?tab=llm`;
  }
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
  if (action === "maintainer.replan_queue_failed") {
    if (projectId) {
      return `/workspaces/${workspaceId}/projects/${projectId}`;
    }
    if (targetType === "task" && targetId) {
      return `/workspaces/${workspaceId}/activity`;
    }
    return `/workspaces/${workspaceId}/activity`;
  }
  return null;
}

/** Tournament audit rows often store taskId without projectId — resolve for links. */
async function resolveTaskProjects(
  workspaceId: string,
  taskIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(taskIds)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const rows = await Promise.all(
    unique.map((taskId) => getTaskForWorkspace(db, workspaceId, taskId)),
  );

  const map = new Map<string, string>();
  for (const task of rows) {
    if (task) map.set(task.id, task.projectId);
  }
  return map;
}

export default async function WorkspaceActivityPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const [rows, mission, arena] = await Promise.all([
    listAuditEventsForWorkspace(db, id, { limit: 100 }),
    getWorkspaceMissionControl(db, id, access.workspace.name),
    listWorkspaceArenaSnapshot(db, id),
  ]);

  const parsed = rows.map((r) => ({
    row: r,
    meta: parseMeta(r.meta),
  }));

  const taskIdsNeedingProject = parsed
    .map(({ meta }) => {
      const taskId = typeof meta?.taskId === "string" ? meta.taskId : null;
      const projectId =
        typeof meta?.projectId === "string" ? meta.projectId : null;
      return taskId && !projectId ? taskId : null;
    })
    .filter((x): x is string => Boolean(x));

  const taskProjectMap = await resolveTaskProjects(id, taskIdsNeedingProject);

  const events: ActivityEvent[] = parsed.map(({ row: r, meta: rawMeta }) => {
    let meta = rawMeta;
    const taskId = typeof meta?.taskId === "string" ? meta.taskId : null;
    const projectId =
      typeof meta?.projectId === "string" ? meta.projectId : null;
    if (taskId && !projectId) {
      const resolved = taskProjectMap.get(taskId);
      if (resolved) {
        meta = { ...(meta ?? {}), projectId: resolved };
      }
    }
    return {
      id: r.id,
      actor: r.actor,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      meta,
      href: hrefFor(id, r.action, meta, r.targetType, r.targetId),
      createdAt: r.createdAt.toISOString(),
    };
  });

  const activeAgents = arena.projects.reduce(
    (sum, lane) =>
      sum + lane.contenders.filter((c) => c.status === "ACTIVE").length,
    0,
  );

  const needsReview =
    mission.metrics.needsApproval + mission.metrics.arenaNeedsAttention;
  const recentReplanFail = events.some(
    (e) => e.action === "maintainer.replan_queue_failed",
  );
  const systemHealthy =
    needsReview === 0 &&
    mission.metrics.budgetStatus !== "paused" &&
    !recentReplanFail;

  return (
    <ActivityShell
      workspaceId={id}
      workspaceName={access.workspace.name}
      events={events}
      metrics={{
        eventsToday: countEventsToday(events),
        activeAgents,
        needsReview,
        systemHealthy,
        healthLabel: systemHealthy
          ? "System healthy"
          : mission.metrics.budgetStatus === "paused"
            ? "Budget paused"
            : recentReplanFail
              ? "Replan failing"
              : "Needs attention",
      }}
    />
  );
}
