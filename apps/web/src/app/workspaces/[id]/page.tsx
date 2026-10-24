import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  getWorkspaceMissionControl,
  listAuditEventsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActivityEvent } from "./activity/events";
import { MissionControl } from "./mission-control";

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
  if (action.startsWith("signal.")) {
    return `/workspaces/${workspaceId}/settings?tab=signals`;
  }
  if (action.startsWith("arena.") || action.startsWith("tournament.")) {
    return projectId
      ? `/workspaces/${workspaceId}/arena?focus=${encodeURIComponent(projectId)}`
      : `/workspaces/${workspaceId}/arena`;
  }
  return null;
}

export default async function WorkspaceOverviewPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const [data, auditRows] = await Promise.all([
    getWorkspaceMissionControl(
      db,
      access.workspace.id,
      access.workspace.name,
    ),
    listAuditEventsForWorkspace(db, access.workspace.id, { limit: 24 }),
  ]);

  const recentEvents: ActivityEvent[] = auditRows.map((r) => {
    const meta = parseMeta(r.meta);
    return {
      id: r.id,
      actor: r.actor,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      meta,
      href: hrefFor(
        access.workspace.id,
        r.action,
        meta,
        r.targetType,
        r.targetId,
      ),
      createdAt: r.createdAt.toISOString(),
    };
  });

  return <MissionControl data={data} recentEvents={recentEvents} />;
}
