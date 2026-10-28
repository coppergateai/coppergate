import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  getWorkspaceOpenProgramBacklog,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BacklogShell } from "./backlog-shell";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Backlog" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  return { title: { absolute: `Backlog · ${name} · Coppergate` } };
}

export default async function WorkspaceBacklogPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const backlog = await getWorkspaceOpenProgramBacklog(
    db,
    access.workspace.id,
  );

  return (
    <BacklogShell
      workspaceId={access.workspace.id}
      workspaceName={access.workspace.name}
      initial={backlog}
    />
  );
}
