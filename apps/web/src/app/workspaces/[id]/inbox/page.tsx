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
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <h1 className={styles.title}>Inbox</h1>
          <div className={styles.chips}>
            <span className={styles.chip}>{access.workspace.name}</span>
            <span className={styles.chip}>
              {pending.length} pending
            </span>
          </div>
        </div>
        <Link
          href={`/workspaces/${id}/projects`}
          className={styles.toolbarGhost}
        >
          Projects
        </Link>
      </header>

      <div className={styles.body}>
        {pending.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No pending approvals</p>
            <p className={styles.emptyBody}>
              Human gates for briefs and tasks land here.{" "}
              <Link
                href={`/workspaces/${id}/projects`}
                className={styles.emptyLink}
              >
                Open projects
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div className={styles.colHead} aria-hidden>
              <span className={styles.colStatus} />
              <span>Type</span>
              <span>Summary</span>
              <span>State</span>
              <span className={styles.colDate}>Requested</span>
            </div>
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
                      <span className={styles.rowId}>{a.targetType}</span>
                      <span className={styles.rowTitle}>{label}</span>
                      <span className={styles.rowPill}>Pending</span>
                      <span className={styles.rowDate}>
                        {formatDate(a.createdAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
