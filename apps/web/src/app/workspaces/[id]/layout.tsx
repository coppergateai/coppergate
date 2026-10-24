import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listPendingApprovalsForWorkspace,
  listProjectsForWorkspace,
  listWorkspacesForUser,
} from "@coppergate/db";
import { AppChrome, WorkspaceNavProvider } from "@/components/app";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Workspace · Coppergate" };
  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  const name = access?.workspace.name ?? "Workspace";
  return {
    title: {
      default: `${name} · Coppergate`,
      template: `%s · ${name} · Coppergate`,
    },
  };
}

export default async function WorkspaceIdLayout({
  children,
  params,
}: LayoutProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const [workspaceRows, projectRows, pending] = await Promise.all([
    listWorkspacesForUser(db, user.id),
    listProjectsForWorkspace(db, id),
    listPendingApprovalsForWorkspace(db, id),
  ]);

  const workspaces = workspaceRows.map(({ workspace, role }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
  }));

  return (
    <WorkspaceNavProvider
      value={{
        workspaceId: access.workspace.id,
        workspaceName: access.workspace.name,
        workspaceSlug: access.workspace.slug,
        projects: projectRows.map(({ project }) => ({
          id: project.id,
          name: project.name,
        })),
        inboxCount: pending.length,
      }}
    >
      <AppChrome
        workspaces={workspaces}
        user={{
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
        }}
      >
        {children}
      </AppChrome>
    </WorkspaceNavProvider>
  );
}
