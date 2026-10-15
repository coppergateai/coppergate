import Link from "next/link";
import { listWorkspacesForUser } from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppChrome } from "@/components/app";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { CreateWorkspaceForm } from "./create-workspace-form";
import styles from "./workspaces.module.css";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function WorkspacesPage() {
  const user = await currentUser();
  // layout already redirects; narrow for TS
  if (!user) {
    return null;
  }

  const rows = await listWorkspacesForUser(db, user.id);
  const inviteRequired = env.PILOT_INVITE_REQUIRED;
  const empty = rows.length === 0;
  const ownerCount = rows.filter(({ role }) => role === "owner").length;

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
        <header className={styles.pageBar}>
          <div className={styles.pageBarLeft}>
            <h1 className={styles.title}>Workspaces</h1>
            {!empty ? (
              <div className={styles.chips}>
                <span className={styles.chip}>{rows.length} total</span>
                <span className={styles.chip}>{ownerCount} owner</span>
                <span className={styles.chip}>
                  {rows.length - ownerCount} member
                </span>
              </div>
            ) : null}
          </div>
          {!empty ? (
            <div
              id="create-workspace"
              className={styles.pageBarCreate}
            >
              <CreateWorkspaceForm inviteRequired={inviteRequired} compact />
            </div>
          ) : null}
        </header>

        {empty ? (
          <div className={styles.body}>
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
                    detail:
                      "Bind one repo, raise the spend cap, set autonomy ≥ L1.",
                    done: false,
                  },
                  {
                    id: "brief",
                    title: "Approve brief → plan → first task",
                    detail:
                      "Submit and approve a small scoped task to queue a run.",
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
              <span className={styles.colId}>Slug</span>
              <span className={styles.colName}>Name</span>
              <span className={styles.colRole}>Role</span>
              <span className={styles.colDate}>Updated</span>
            </div>
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
                    <span className={styles.rowId}>/{workspace.slug}</span>
                    <span className={styles.rowTitle}>{workspace.name}</span>
                    <span className={styles.rowPill}>{role}</span>
                    <span className={styles.rowDate}>
                      {formatDate(workspace.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </AppChrome>
  );
}
