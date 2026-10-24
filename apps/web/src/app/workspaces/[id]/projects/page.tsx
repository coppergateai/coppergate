import { notFound, redirect } from "next/navigation";
import {
  getInstallationForWorkspace,
  getWorkspaceForMember,
  listProjectsForWorkspace,
  listRepositoryConnections,
  workspaceListBlurb,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectsHome } from "./projects-home";

type PageProps = { params: Promise<{ id: string }> };

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function WorkspaceProjectsPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const projects = await listProjectsForWorkspace(db, id);
  const connections = await listRepositoryConnections(db, id);
  const unbound = connections.filter((c) => !c.projectId);
  const installation = await getInstallationForWorkspace(db, id);
  const githubReady =
    !!installation &&
    installation.status === "active" &&
    connections.length > 0;
  const canCreate = access.role === "owner" && unbound.length > 0;
  const canManage = access.role === "owner";

  return (
    <ProjectsHome
      workspaceId={id}
      workspace={{
        name: access.workspace.name,
        slug: access.workspace.slug,
        role: access.role,
        blurb: workspaceListBlurb(access.workspace.slug),
      }}
      projects={projects.map(({ project, repository }) => ({
        id: project.id,
        name: project.name,
        mode: project.mode,
        stack: project.stack,
        ready: !!project.currentBriefId,
        repoFullName: repository.baseRepoFullName ?? null,
        updatedAt: formatDate(project.updatedAt),
        updatedAtIso: project.updatedAt.toISOString(),
      }))}
      unbound={unbound.map((r) => ({
        id: r.id,
        fullName: r.baseRepoFullName,
        defaultBranch: r.defaultBranch,
      }))}
      githubReady={githubReady}
      canCreate={canCreate}
      canManage={canManage}
    />
  );
}
