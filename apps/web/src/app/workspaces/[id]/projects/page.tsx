import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getInstallationForWorkspace,
  getWorkspaceForMember,
  listProjectsForWorkspace,
  listRepositoryConnections,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { db } from "@/lib/db";
import { CreateProjectForm } from "./create-project-form";

type PageProps = { params: Promise<{ id: string }> };

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

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <p style={{ margin: 0 }}>
        <Link href={`/workspaces/${id}/settings`} style={{ color: "#A3A3A3" }}>
          ← Settings
        </Link>
        {" · "}
        <Link href={`/workspaces/${id}/inbox`} style={{ color: "#A3A3A3" }}>
          Inbox
        </Link>
      </p>
      <h1 style={{ margin: "1.25rem 0 0.35rem", fontSize: "1.75rem", fontWeight: 600 }}>
        Projects
      </h1>
      <p style={{ margin: 0, color: "#A3A3A3" }}>
        {access.workspace.name} · one GitHub repo per project · stack nextjs_ts
      </p>

      {projects.length === 0 ? (
        <OnboardingGuide
          title="Project setup"
          steps={[
            {
              id: "github",
              title: "Connect GitHub App + select a repo",
              detail: "Settings → Install → Connect an unbound repository.",
              href: `/workspaces/${id}/settings`,
              done: githubReady,
            },
            {
              id: "project",
              title: "Create your first project",
              detail: "Bind the repo below. Supported stack: nextjs_ts.",
              done: false,
            },
            {
              id: "budget",
              title: "Set a spend cap",
              detail: "Open the project and raise the budget before queueing work.",
              done: false,
            },
            {
              id: "brief",
              title: "Approve brief → plan → task",
              detail: "Keep the first task tiny so the first PR lands in one session.",
              done: false,
            },
          ]}
        />
      ) : null}

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Your projects
        </h2>
        {projects.length === 0 ? (
          <p style={{ color: "#737373" }}>
            No projects yet
            {!githubReady
              ? " — connect GitHub in settings first."
              : " — create one below."}
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {projects.map(({ project, repository }) => (
              <li
                key={project.id}
                style={{
                  padding: "0.85rem 0",
                  borderBottom: "1px solid #262626",
                }}
              >
                <Link
                  href={`/workspaces/${id}/projects/${project.id}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div style={{ fontWeight: 500 }}>{project.name}</div>
                  <div
                    style={{
                      color: "#737373",
                      fontSize: "0.875rem",
                      marginTop: 4,
                    }}
                  >
                    {repository.baseRepoFullName} · {project.mode} ·{" "}
                    {project.stack}
                    {project.currentBriefId ? " · brief approved" : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {access.role === "owner" ? (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            Create project
          </h2>
          {unbound.length === 0 ? (
            <p style={{ color: "#737373", fontSize: "0.875rem" }}>
              Connect an unbound repository in{" "}
              <Link href={`/workspaces/${id}/settings`} style={{ color: "#A3A3A3" }}>
                settings
              </Link>{" "}
              first.
            </p>
          ) : (
            <CreateProjectForm
              workspaceId={id}
              repositories={unbound.map((r) => ({
                id: r.id,
                fullName: r.baseRepoFullName,
              }))}
            />
          )}
        </section>
      ) : null}
    </main>
  );
}
