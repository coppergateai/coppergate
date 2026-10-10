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
import { SiteChrome } from "../../../site-chrome";
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

  const createBlock =
    access.role === "owner" ? (
      <section className={styles.section} aria-labelledby="create-heading">
        <h2 id="create-heading" className={styles.sectionLabel}>
          Create project
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

  return (
    <SiteChrome>
      <main className={styles.main}>
        <p className={styles.nav}>
          <Link
            href={`/workspaces/${id}/settings`}
            className={styles.navLink}
          >
            ← Settings
          </Link>
          <span aria-hidden="true">·</span>
          <Link href={`/workspaces/${id}/inbox`} className={styles.navLink}>
            Inbox
          </Link>
        </p>
        <p className={styles.eyebrow}>Projects</p>
        <h1 className={styles.title}>{access.workspace.name}</h1>
        <p className={styles.lede}>
          One GitHub repo per project · stack <code>nextjs_ts</code>
        </p>

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
            <section className={styles.section} aria-labelledby="list-heading">
              <h2 id="list-heading" className={styles.sectionLabel}>
                Your projects
              </h2>
              <ul className={styles.list}>
                {projects.map(({ project, repository }) => (
                  <li key={project.id} className={styles.row}>
                    <Link
                      href={`/workspaces/${id}/projects/${project.id}`}
                      className={styles.rowLink}
                    >
                      <div className={styles.rowName}>{project.name}</div>
                      <div className={styles.rowMeta}>
                        {repository.baseRepoFullName} · {project.mode} ·{" "}
                        {project.stack}
                        {project.currentBriefId ? " · brief approved" : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            {createBlock}
          </>
        )}
      </main>
    </SiteChrome>
  );
}
