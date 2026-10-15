import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listAuditEventsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import styles from "../inbox/inbox.module.css";

type PageProps = { params: Promise<{ id: string }> };

function formatRelative(iso: Date): string {
  const diff = Date.now() - iso.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return iso.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hrefFor(
  workspaceId: string,
  action: string,
  meta: Record<string, unknown> | null,
): string | null {
  const projectId =
    typeof meta?.projectId === "string" ? meta.projectId : null;
  const taskId = typeof meta?.taskId === "string" ? meta.taskId : null;
  if (taskId && projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`;
  }
  if (projectId) {
    return `/workspaces/${workspaceId}/projects/${projectId}`;
  }
  if (action.startsWith("signal.")) {
    return `/workspaces/${workspaceId}/settings?tab=signals`;
  }
  return null;
}

function labelFor(action: string): string {
  return action.replace(/\./g, " · ");
}

export default async function WorkspaceActivityPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) notFound();

  const rows = await listAuditEventsForWorkspace(db, id, { limit: 60 });

  return (
    <main className={styles.main}>
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <h1 className={styles.title}>Activity</h1>
          <div className={styles.chips}>
            <span className={styles.chip}>{access.workspace.name}</span>
            <span className={styles.chip}>{rows.length} recent</span>
          </div>
        </div>
        <Link
          href={`/workspaces/${id}/inbox`}
          className={styles.toolbarGhost}
        >
          Inbox
        </Link>
      </header>

      <div className={styles.body}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No activity yet</p>
            <p className={styles.emptyBody}>
              Approvals, briefs, signals, and runs will show up here.{" "}
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
            {rows.map((r) => {
              const meta = parseMeta(r.meta);
              const href = hrefFor(id, r.action, meta);
              const title = labelFor(r.action);
              const detail =
                typeof meta?.message === "string"
                  ? meta.message
                  : r.targetType && r.targetId
                    ? `${r.targetType} ${r.targetId.slice(0, 8)}`
                    : r.actor;
              const inner = (
                <>
                  <span
                    className={`${styles.statusRing} ${styles.statusSettled}`}
                    aria-hidden
                  />
                  <span className={styles.rowBody}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowType}>{r.actor}</span>
                      <span className={styles.rowTime}>
                        {formatRelative(r.createdAt)}
                      </span>
                    </span>
                    <span className={styles.rowTitle}>{title}</span>
                    <span className={styles.rowMeta}>{detail}</span>
                  </span>
                </>
              );
              return (
                <li key={r.id} className={styles.row}>
                  {href ? (
                    <Link href={href} className={styles.rowLinkActivity}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={styles.rowLinkActivity}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
