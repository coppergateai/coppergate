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
        s === "RUNNING" || s === "VALIDATING" || s === "REVIEW_REQUIRED",
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
        Tasks by status. Open one to watch runs and cost.
      </p>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks on the board yet"
          body="Generate a plan from an approved brief, or import a GitHub issue from Overview to queue the first delivery."
          action={
            <Link
              href={`#plan`}
              className={styles.linkCta}
            >
              Go to plan
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
                  {items.map((t) => (
                    <li key={t.id} className={styles.boardCard}>
                      <Link
                        href={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${t.id}`}
                      >
                        <div className={styles.boardCardTitle}>{t.title}</div>
                        <div className={styles.boardCardMeta}>
                          {t.milestoneTitle} · {t.status}
                          {t.estimateMicros != null
                            ? ` · ${(t.estimateMicros / 100).toFixed(0)}¢`
                            : ""}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
