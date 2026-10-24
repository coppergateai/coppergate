import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  getWorkspaceMissionControl,
  listAuditEventsForWorkspace,
} from "@coppergate/db";
import { activityHref } from "@/lib/activity-href";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActivityEvent } from "./activity/events";
import { MissionControl } from "./mission-control";

type PageProps = { params: Promise<{ id: string }> };

/** Same-segment as layout — template from layout does not apply here. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Mission Control" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  // Absolute: same-segment page skips the workspace layout template.
  return { title: { absolute: `Mission Control · ${name} · Coppergate` } };
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
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
      href: activityHref(
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
