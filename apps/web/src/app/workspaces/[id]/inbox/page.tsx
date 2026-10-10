import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listPendingApprovalsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteChrome } from "../../../site-chrome";
import styles from "./inbox.module.css";

type PageProps = { params: Promise<{ id: string }> };

export default async function WorkspaceInboxPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const pending = await listPendingApprovalsForWorkspace(db, id);

  return (
    <SiteChrome>
      <main className={styles.main}>
        <p className={styles.nav}>
          <Link href={`/workspaces/${id}/projects`} className={styles.navLink}>
            ← Projects
          </Link>
          <span aria-hidden="true">·</span>
          <Link href={`/workspaces/${id}/settings`} className={styles.navLink}>
            Settings
          </Link>
        </p>
        <p className={styles.eyebrow}>Inbox</p>
        <h1 className={styles.title}>Review inbox</h1>
        <p className={styles.lede}>
          Pending approvals for {access.workspace.name}
        </p>

        <section className={styles.section} aria-label="Pending approvals">
          {pending.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No pending approvals</p>
              <p className={styles.emptyBody}>
                When a brief or task needs a human gate, it shows up here.{" "}
                <Link
                  href={`/workspaces/${id}/projects`}
                  className={styles.emptyLink}
                >
                  Open projects
                </Link>{" "}
                to keep the path moving.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {pending.map((a) => {
                const href = `/workspaces/${id}/projects/${a.projectId}`;
                return (
                  <li key={a.id} className={styles.row}>
                    <Link href={href} className={styles.rowLink}>
                      <div className={styles.rowTitle}>
                        <span className={styles.badge}>{a.targetType}</span>
                        {a.riskSummary || a.targetId.slice(0, 8)}
                      </div>
                      <div className={styles.rowMeta}>
                        pending · requested {a.createdAt.toISOString()}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </SiteChrome>
  );
}
