import Link from "next/link";
import { listWorkspacesForUser } from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppChrome } from "@/components/app";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { CreateWorkspaceForm } from "./create-workspace-form";
import styles from "./workspaces.module.css";

export default async function WorkspacesPage() {
  const user = await currentUser();
  // layout already redirects; narrow for TS
  if (!user) {
    return null;
  }

  const rows = await listWorkspacesForUser(db, user.id);
  const inviteRequired = env.PILOT_INVITE_REQUIRED;
  const empty = rows.length === 0;

  const workspaces = rows.map(({ workspace, role }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
  }));

  const sidebarUser = {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };

  return (
    <AppChrome workspaces={workspaces} user={sidebarUser}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Workspaces</h1>
          {!empty ? (
            <div className={styles.toolbar}>
              <a href="#create-workspace" className={styles.toolbarPrimary}>
                + New workspace
              </a>
              <span className={styles.toolbarMeta}>
                {rows.length} workspace{rows.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <p className={styles.lede}>
              Name a workspace to own projects and GitHub connections — then walk
              the first-run path.
            </p>
          )}
        </header>

        {empty ? (
          <>
            <section
              id="create-workspace"
              className={styles.primary}
              aria-labelledby="create-heading"
            >
              <h2 id="create-heading" className={styles.sectionLabel}>
                Create workspace
              </h2>
              <CreateWorkspaceForm inviteRequired={inviteRequired} />
            </section>

            <div className={styles.path}>
              <OnboardingGuide
                compact
                title="First run"
                steps={[
                  {
                    id: "invite",
                    title: inviteRequired
                      ? "Enter your pilot invite"
                      : "Create a workspace",
                    detail: inviteRequired
                      ? "Public beta is invite-only. Use the code from your welcome email."
                      : "Name your workspace — you’ll connect GitHub next.",
                    done: false,
                  },
                  {
                    id: "github",
                    title: "Connect GitHub App",
                    detail: "Install on a throwaway or low-risk repo in Settings.",
                    done: false,
                  },
                  {
                    id: "project",
                    title: "Create a project + set budget",
                    detail: "Bind one repo, raise the spend cap, set autonomy ≥ L1.",
                    done: false,
                  },
                  {
                    id: "brief",
                    title: "Approve brief → plan → first task",
                    detail: "Submit and approve a small scoped task to queue a run.",
                    done: false,
                  },
                ]}
              />
            </div>
          </>
        ) : (
          <>
            <section className={styles.primary} aria-label="Your workspaces">
              <ul className={styles.list}>
                {rows.map(({ workspace, role }) => (
                  <li key={workspace.id} className={styles.row}>
                    <Link
                      href={`/workspaces/${workspace.id}/projects`}
                      className={styles.rowLink}
                    >
                      <span
                        className={`${styles.statusRing} ${
                          role === "owner"
                            ? styles.statusActive
                            : styles.statusIdle
                        }`}
                        aria-hidden
                      />
                      <div className={styles.rowMain}>
                        <span className={styles.rowId}>
                          /{workspace.slug}
                        </span>
                        <span className={styles.rowTitle}>{workspace.name}</span>
                      </div>
                      <span className={styles.rowPill}>{role}</span>
                      <span className={styles.rowAction}>Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section
              id="create-workspace"
              className={styles.secondary}
              aria-labelledby="create-heading"
            >
              <h2 id="create-heading" className={styles.sectionLabel}>
                New workspace
              </h2>
              <CreateWorkspaceForm inviteRequired={inviteRequired} />
            </section>
          </>
        )}
      </main>
    </AppChrome>
  );
}
