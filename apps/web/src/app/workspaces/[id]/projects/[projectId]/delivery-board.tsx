"use client";

import Link from "next/link";
import { EmptyState } from "@/components/app/ui";
import styles from "./project-detail.module.css";

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  estimateMicros: number | null;
  estimateComplexity: string | null;
  milestoneTitle: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  tasks: BoardTask[];
};

const COLUMNS: { key: string; label: string; match: (s: string) => boolean }[] =
  [
    {
      key: "backlog",
      label: "Backlog",
      match: (s) => s === "DRAFT" || s === "READY_FOR_APPROVAL",
    },
    {
      key: "queued",
      label: "Queued",
      match: (s) => s === "QUEUED",
    },
    {
      key: "active",
      label: "Running",
      match: (s) =>
        s === "RUNNING" || s === "VALIDATING" || s === "WAITING_CI",
    },
    {
      key: "review",
      label: "Review",
      match: (s) => s === "REVIEW_REQUIRED" || s === "IN_REVIEW",
    },
    {
      key: "done",
      label: "Accepted",
      match: (s) => s === "ACCEPTED" || s === "DONE",
    },
    {
      key: "blocked",
      label: "Failed / blocked",
      match: (s) =>
        s === "FAILED" ||
        s === "BLOCKED" ||
        s === "CANCELLED" ||
        s === "EXPIRED" ||
        s === "NEEDS_REPLAN",
    },
  ];

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "READY_FOR_APPROVAL":
      return "Needs approval";
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "VALIDATING":
      return "Validating";
    case "REVIEW_REQUIRED":
      return "In review";
    case "ACCEPTED":
      return "Accepted";
    case "DONE":
      return "Done";
    case "FAILED":
      return "Failed";
    case "BLOCKED":
      return "Blocked";
    case "CANCELLED":
      return "Cancelled";
    case "EXPIRED":
      return "Expired";
    case "NEEDS_REPLAN":
      return "Needs replan";
    default:
      return status;
  }
}

export function DeliveryBoard({ workspaceId, projectId, tasks }: Props) {
  return (
    <section
      id="board"
      className={styles.section}
      aria-labelledby="board-heading"
    >
      <h2 id="board-heading" className={styles.sectionLabel}>
        Delivery board
      </h2>
      <p className={styles.sectionLede}>
        Tasks by status. Open one to watch runs and cost. After Start, the
        board refills itself under budget — no plan entry.
      </p>

      {tasks.length === 0 ? (
        <EmptyState
          title="No deliveries yet"
          body="Primary path: Import → queue a GitHub issue on Overview, then review Evidence before Accept. Arena Start can invent work under the same spend envelope."
          action={
            <Link
              href={`/workspaces/${workspaceId}/projects/${projectId}?tab=overview#issues`}
              className={styles.linkCta}
            >
              Import issue →
            </Link>
          }
        />
      ) : (
        <div className={styles.boardGrid}>
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => col.match(t.status));
            return (
              <div key={col.key} className={styles.boardCol}>
                <div className={styles.boardHead}>
                  {col.label}
                  <span className={styles.boardCount}> {items.length}</span>
                </div>
                <ul className={styles.taskList}>
                  {items.map((t) => {
                    const href =
                      t.status === "REVIEW_REQUIRED"
                        ? `/workspaces/${workspaceId}/projects/${projectId}?tab=evidence`
                        : `/workspaces/${workspaceId}/projects/${projectId}/tasks/${t.id}`;
                    return (
                      <li key={t.id} className={styles.boardCard}>
                        <Link href={href}>
                          <div className={styles.boardCardTitle}>{t.title}</div>
                          <div className={styles.boardCardMeta} title={t.status}>
                            {t.milestoneTitle} · {statusLabel(t.status)}
                            {t.estimateMicros != null
                              ? ` · $${(t.estimateMicros / 1_000_000).toFixed(2)}`
                              : ""}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
