import Link from "next/link";
import { Suspense } from "react";
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
import { RedetectStacksButton } from "./redetect-stacks-button";
import { UnboundReposPanel } from "./unbound-repos-panel";
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
  const canManage = access.role === "owner";

  const ready = projects.filter(({ project }) => project.currentBriefId);
  const setup = projects.filter(({ project }) => !project.currentBriefId);

  const unboundPanel = (
    <UnboundReposPanel
      workspaceId={id}
      canManage={canManage}
      repositories={unbound.map((r) => ({
        id: r.id,
        fullName: r.baseRepoFullName,
        defaultBranch: r.defaultBranch,
      }))}
    />
  );

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
          {canManage && projects.length > 0 ? (
            <RedetectStacksButton workspaceId={id} />
          ) : null}
          {canCreate ? (
            <Suspense
              fallback={
                <span className={styles.chip}>Loading create form…</span>
              }
            >
              <CreateProjectForm
                workspaceId={id}
                repositories={unbound.map((r) => ({
                  id: r.id,
                  fullName: r.baseRepoFullName,
                }))}
                compact
              />
            </Suspense>
          ) : access.role === "owner" && unbound.length === 0 && projects.length === 0 ? (
            <Link
              href={`/workspaces/${id}/settings?tab=connections`}
              className={styles.toolbarPrimary}
            >
              Connect repo
            </Link>
          ) : null}
        </div>
      </header>

      {empty ? (
        <div className={styles.bodyPad}>
          {unbound.length === 0 && access.role === "owner" ? (
            <div className={styles.wizardShell}>
              <div className={styles.wizardIntro}>
                <p className={styles.wizardEyebrow}>Empty workspace</p>
                <h2 className={styles.wizardHeading}>
                  Ship your first arena in four steps.
                </h2>
                <p className={styles.wizardLede}>
                  Connect a repo, bind a project, set a spend cap, then approve
                  a tiny brief. Coppergate handles the contest from there.
                </p>
              </div>
              <OnboardingGuide
                compact
                title="Project setup"
                steps={[
                  {
                    id: "github",
                    title: "Connect GitHub App + select a repo",
                    detail:
                      "Install the Coppergate GitHub App on an org or personal account, then connect at least one repository to this workspace.",
                    href: `/workspaces/${id}/settings?tab=connections`,
                    ctaLabel: "Connect GitHub",
                    done: githubReady,
                  },
                  {
                    id: "project",
                    title: "Bind a repository into a project",
                    detail:
                      "After repos are connected, return here and bind one — stack is detected from the repository.",
                    done: projects.length > 0,
                  },
                  {
                    id: "budget",
                    title: "Set a spend cap",
                    detail:
                      "Open the project budget panel and raise a hard stop before queueing agent work.",
                    done: false,
                  },
                  {
                    id: "brief",
                    title: "Approve brief → plan → task",
                    detail:
                      "Keep the first task tiny so the first PR lands in one session. Then open the project Agents tab to arm the arena.",
                    done: false,
                  },
                ]}
              />
            </div>
          ) : (
            <div className={styles.wizardShell}>
              <div className={styles.wizardIntro}>
                <p className={styles.wizardEyebrow}>Repos ready</p>
                <h2 className={styles.wizardHeading}>
                  Bind a repository to create your first project.
                </h2>
                <p className={styles.wizardLede}>
                  Connected repos below are unbound. Bind one to unlock budget,
                  brief, and the Agents arena loop.
                </p>
              </div>
              <OnboardingGuide
                compact
                title="Project setup"
                steps={[
                  {
                    id: "github",
                    title: "Connect GitHub App + select a repo",
                    detail: "Repositories are connected to this workspace.",
                    done: true,
                  },
                  {
                    id: "project",
                    title: "Bind a repository into a project",
                    detail:
                      "Use Bind all or pick a single repo in the panel below.",
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
                      "Keep the first task tiny so the first PR lands in one session. Then open the project Agents tab to arm the arena.",
                    done: false,
                  },
                ]}
              />
              {unboundPanel}
            </div>
          )}
        </div>
      ) : (
        <>
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
          </div>
          {unbound.length > 0 ? (
            <div className={styles.unboundWrap}>{unboundPanel}</div>
          ) : null}
        </>
      )}
    </main>
  );
}
