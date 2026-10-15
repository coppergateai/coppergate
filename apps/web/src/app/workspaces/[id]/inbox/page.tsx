import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listPendingApprovalsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import styles from "./inbox.module.css";

type PageProps = { params: Promise<{ id: string }> };

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Inbox</h1>
        <div className={styles.toolbar}>
          <Link
            href={`/workspaces/${id}/projects`}
            className={styles.toolbarGhost}
          >
            Projects
          </Link>
          <span className={styles.toolbarMeta}>
            {access.workspace.name}
            {pending.length > 0
              ? ` · ${pending.length} pending`
              : " · clear"}
          </span>
        </div>
      </header>

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
              </Link>
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {pending.map((a) => {
              const href = `/workspaces/${id}/projects/${a.projectId}`;
              const label =
                a.riskSummary?.trim() ||
                `${a.targetType} ${a.targetId.slice(0, 8)}`;
              return (
                <li key={a.id} className={styles.row}>
                  <Link href={href} className={styles.rowLink}>
                    <span
                      className={`${styles.statusRing} ${styles.statusPending}`}
                      aria-hidden
                    />
                    <div className={styles.rowMain}>
                      <span className={styles.rowId}>{a.targetType}</span>
                      <span className={styles.rowTitle}>{label}</span>
                    </div>
                    <span className={styles.rowPill}>Pending</span>
                    <span className={styles.rowDate}>
                      {formatDate(a.createdAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
