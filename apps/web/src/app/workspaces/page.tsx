import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkspacesForUser } from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { SiteChrome } from "../site-chrome";
import { CreateWorkspaceForm } from "./create-workspace-form";
import styles from "./workspaces.module.css";

export default async function WorkspacesPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const rows = await listWorkspacesForUser(db, user.id);
  const inviteRequired = env.PILOT_INVITE_REQUIRED;
  const empty = rows.length === 0;

  return (
    <SiteChrome>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Private beta</p>
        <h1 className={styles.title}>Workspaces</h1>
        <p className={styles.lede}>
          {empty
            ? "Name a workspace to own projects and GitHub connections — then walk the first-run path."
            : "Open a workspace to manage projects, budgets, and GitHub connections."}
        </p>

        {empty ? (
          <>
            <section className={styles.primary} aria-labelledby="create-heading">
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
            <section className={styles.primary} aria-labelledby="list-heading">
              <h2 id="list-heading" className={styles.sectionLabel}>
                Your workspaces
              </h2>
              <ul className={styles.list}>
                {rows.map(({ workspace, role }) => (
                  <li key={workspace.id} className={styles.row}>
                    <Link
                      href={`/workspaces/${workspace.id}/settings`}
                      className={styles.rowLink}
                    >
                      <div>
                        <div className={styles.rowName}>{workspace.name}</div>
                        <div className={styles.rowMeta}>
                          /{workspace.slug} · {role}
                        </div>
                      </div>
                      <span className={styles.rowAction}>Settings</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.secondary} aria-labelledby="create-heading">
              <h2 id="create-heading" className={styles.sectionLabel}>
                Create workspace
              </h2>
              <CreateWorkspaceForm inviteRequired={inviteRequired} />
            </section>
          </>
        )}
      </main>
    </SiteChrome>
  );
}
