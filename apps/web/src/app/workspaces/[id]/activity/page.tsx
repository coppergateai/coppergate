import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getTaskForWorkspace,
  getWorkspaceForMember,
  getWorkspaceMissionControl,
  listAuditEventsForWorkspace,
  listWorkspaceArenaSnapshot,
} from "@coppergate/db";
import { activityHref } from "@/lib/activity-href";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActivityShell } from "./activity-shell";
import type { ActivityEvent } from "./events";
import { countEventsToday } from "./events";

export const metadata: Metadata = { title: "Activity" };

type PageProps = { params: Promise<{ id: string }> };

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
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
      href: activityHref(id, r.action, meta, r.targetType, r.targetId),
      createdAt: r.createdAt.toISOString(),
    };
  });

  const activeAgents = arena.projects.reduce(
    (sum, lane) =>
      sum + lane.contenders.filter((c) => c.status === "ACTIVE").length,
    0,
  );

  const needsReview =
    mission.metrics.needsApproval +
    mission.metrics.needsEvidenceAccept +
    mission.metrics.arenaNeedsAttention;
  const recentReplanFail = events.some(
    (e) => e.action === "maintainer.replan_queue_failed",
  );
  const recentMergeBlocked = events.some((e) => e.action === "merge.blocked");
  const systemHealthy =
    needsReview === 0 &&
    mission.metrics.budgetStatus !== "paused" &&
    !recentReplanFail &&
    !recentMergeBlocked;

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
            : recentMergeBlocked
              ? "Merge blocked"
              : recentReplanFail
                ? "Replan failing"
                : "Needs attention",
      }}
    />
  );
}
