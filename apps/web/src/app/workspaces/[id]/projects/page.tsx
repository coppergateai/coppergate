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
  const empty = projects.length === 0;
  const canCreate = access.role === "owner" && unbound.length > 0;

  const ready = projects.filter(({ project }) => project.currentBriefId);
  const setup = projects.filter(({ project }) => !project.currentBriefId);

  function projectRows(
    items: typeof projects,
    statusClass: string | undefined,
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
                className={`${styles.statusRing} ${statusClass ?? ""}`}
                aria-hidden
              />
              <span className={styles.rowId}>{project.stack}</span>
              <span className={styles.rowTitle}>{project.name}</span>
              <span className={styles.rowMeta}>
                {repository.baseRepoFullName}
              </span>
              <span className={styles.rowMode}>{project.mode}</span>
              {project.currentBriefId ? (
                <span className={styles.rowPill}>Brief</span>
              ) : (
                <span className={styles.rowPillMuted}>Setup</span>
              )}
              <span className={styles.rowDate}>
                {formatDate(project.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <h1 className={styles.title}>Projects</h1>
          <div className={styles.chips}>
            <span className={styles.chip}>{access.workspace.name}</span>
            <span className={styles.chip}>{projects.length} projects</span>
            <span className={styles.chip}>{ready.length} ready</span>
            <span className={styles.chip}>{setup.length} setup</span>
            <span className={styles.chip}>{unbound.length} unbound</span>
          </div>
        </div>
        <div id="create-project" className={styles.pageBarCreate}>
          {canCreate ? (
            <CreateProjectForm
              workspaceId={id}
              repositories={unbound.map((r) => ({
                id: r.id,
                fullName: r.baseRepoFullName,
              }))}
              compact
            />
          ) : access.role === "owner" ? (
            <Link
              href={`/workspaces/${id}/settings`}
              className={styles.toolbarPrimary}
            >
              Connect repo in settings
            </Link>
          ) : null}
        </div>
      </header>

      {empty ? (
        <div className={styles.bodyPad}>
          {!canCreate && access.role === "owner" ? (
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
          ) : null}
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
                  detail: "Bind the repo above. Supported stack: nextjs_ts.",
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
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.colHead} aria-hidden>
            <span className={styles.colStatus} />
            <span>Stack</span>
            <span>Name</span>
            <span>Repository</span>
            <span>Mode</span>
            <span>State</span>
            <span className={styles.colDate}>Updated</span>
          </div>

          {ready.length > 0 ? (
            <section aria-labelledby="ready-heading">
              <h2 id="ready-heading" className={styles.groupLabel}>
                Ready
                <span className={styles.groupCount}>{ready.length}</span>
              </h2>
              {projectRows(ready, styles.statusActive ?? "")}
            </section>
          ) : null}

          {setup.length > 0 ? (
            <section aria-labelledby="setup-heading">
              <h2 id="setup-heading" className={styles.groupLabel}>
                Setup
                <span className={styles.groupCount}>{setup.length}</span>
              </h2>
              {projectRows(setup, styles.statusIdle ?? "")}
            </section>
          ) : null}

          {unbound.length > 0 ? (
            <section aria-labelledby="unbound-heading">
              <h2 id="unbound-heading" className={styles.groupLabel}>
                Unbound repositories
                <span className={styles.groupCount}>{unbound.length}</span>
              </h2>
              <ul className={styles.list}>
                {unbound.map((r) => (
                  <li key={r.id} className={styles.row}>
                    <div className={styles.rowStatic}>
                      <span
                        className={`${styles.statusRing} ${styles.statusIdle ?? ""}`}
                        aria-hidden
                      />
                      <span className={styles.rowId}>repo</span>
                      <span className={styles.rowTitle}>
                        {r.baseRepoFullName}
                      </span>
                      <span className={styles.rowMeta}>Available to bind</span>
                      <span className={styles.rowMode}>—</span>
                      <span className={styles.rowPillMuted}>Unbound</span>
                      <a href="#create-project" className={styles.rowBind}>
                        Bind
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
