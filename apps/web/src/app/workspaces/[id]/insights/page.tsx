import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  getWorkspaceMissionControl,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { InsightsShell } from "./insights-shell";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Insights" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  return { title: { absolute: `Insights · ${name} · Coppergate` } };
}

export default async function WorkspaceInsightsPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const mission = await getWorkspaceMissionControl(
    db,
    access.workspace.id,
    access.workspace.name,
  );

  return (
    <InsightsShell
      workspaceId={access.workspace.id}
      workspaceName={access.workspace.name}
      isOwner={access.role === "owner"}
      verifiedPrsThisMonth={mission.metrics.verifiedPrsThisMonth}
    />
  );
}
