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
import styles from "./projects.module.css";

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
  const empty = projects.length === 0;
  const canCreate = access.role === "owner" && unbound.length > 0;

  const ready = projects.filter(({ project }) => project.currentBriefId);
  const setup = projects.filter(({ project }) => !project.currentBriefId);

  const createBlock =
    access.role === "owner" ? (
      <section
        id="create-project"
        className={styles.section}
        aria-labelledby="create-heading"
      >
        <h2 id="create-heading" className={styles.sectionLabel}>
          New project
        </h2>
        {unbound.length === 0 ? (
          <p className={styles.muted}>
            Connect an unbound repository in{" "}
            <Link
              href={`/workspaces/${id}/settings`}
              className={styles.inlineLink}
            >
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
    ) : null;

  function projectRows(
    items: typeof projects,
    statusClass: string,
  ) {
    return (
      <ul className={styles.list}>
        {items.map(({ project, repository }) => (
          <li key={project.id} className={styles.row}>
            <Link
              href={`/workspaces/${id}/projects/${project.id}`}
              className={styles.rowLink}
            >
              <span
                className={`${styles.statusRing} ${statusClass}`}
                aria-hidden
              />
              <div className={styles.rowMain}>
                <span className={styles.rowId}>
                  {project.stack}
                </span>
                <span className={styles.rowTitle}>{project.name}</span>
              </div>
              <span className={styles.rowMeta}>
                {repository.baseRepoFullName}
              </span>
              {project.currentBriefId ? (
                <span className={styles.rowPill}>Brief</span>
              ) : (
                <span className={styles.rowPillMuted}>Setup</span>
              )}
              <span className={styles.rowAction}>Open</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Projects</h1>
        <div className={styles.toolbar}>
          {canCreate ? (
            <a href="#create-project" className={styles.toolbarPrimary}>
              + New project
            </a>
          ) : access.role === "owner" ? (
            <Link
              href={`/workspaces/${id}/settings`}
              className={styles.toolbarPrimary}
            >
              Connect repo
            </Link>
          ) : null}
          <span className={styles.toolbarMeta}>
            {access.workspace.name}
            {!empty ? ` · ${projects.length}` : ""}
          </span>
        </div>
      </header>

      {empty ? (
        <>
          {createBlock}
          <div className={styles.path}>
            <OnboardingGuide
              compact
              title="Project setup"
              steps={[
                {
                  id: "github",
                  title: "Connect GitHub App + select a repo",
                  detail:
                    "Settings → Install → Connect an unbound repository.",
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
                  detail:
                    "Open the project and raise the budget before queueing work.",
                  done: false,
                },
                {
                  id: "brief",
                  title: "Approve brief → plan → task",
                  detail:
                    "Keep the first task tiny so the first PR lands in one session.",
                  done: false,
                },
              ]}
            />
          </div>
        </>
      ) : (
        <>
          {ready.length > 0 ? (
            <section className={styles.section} aria-labelledby="ready-heading">
              <h2 id="ready-heading" className={styles.groupLabel}>
                Ready
                <span className={styles.groupCount}>{ready.length}</span>
              </h2>
              {projectRows(ready, styles.statusActive ?? "")}
            </section>
          ) : null}

          {setup.length > 0 ? (
            <section className={styles.section} aria-labelledby="setup-heading">
              <h2 id="setup-heading" className={styles.groupLabel}>
                Setup
                <span className={styles.groupCount}>{setup.length}</span>
              </h2>
              {projectRows(setup, styles.statusIdle ?? "")}
            </section>
          ) : null}

          {createBlock}
        </>
      )}
    </main>
  );
}
