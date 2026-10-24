import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  getWorkspaceMissionControl,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MissionControl } from "./mission-control";

type PageProps = { params: Promise<{ id: string }> };

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

  const data = await getWorkspaceMissionControl(
    db,
    access.workspace.id,
    access.workspace.name,
  );

  return <MissionControl data={data} />;
}
