import Link from "next/link";
import styles from "./project-detail.module.css";

export type EvidenceDeliveryRow = {
  taskId: string;
  title: string;
  status: string;
  prUrl: string | null;
  updatedAt: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  deliveries: EvidenceDeliveryRow[];
};

function statusHint(status: string): string {
  if (status === "REVIEW_REQUIRED") return "Ready for human Accept";
  if (status === "ACCEPTED" || status === "DONE") return "Verified delivery";
  if (status === "WAITING_CI") return "Awaiting CI evidence";
  return status;
}

/**
 * Evidence Center v1 — lists recent deliveries with deep-links to task review.
 * Full artifact aggregator lands in Faz 2.
 */
export function EvidencePanel({
  workspaceId,
  projectId,
  deliveries,
}: Props) {
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;

  return (
    <section className={styles.section} aria-labelledby="evidence-heading">
      <div className={styles.sectionHead}>
        <h2 id="evidence-heading" className={styles.sectionLabel}>
          Evidence
        </h2>
      </div>
      <p className={styles.sectionLede}>
        Why a delivery is acceptable — CI, diff, findings, cost, and policy.
        Open a task to inspect the full verification pack before Accept.
      </p>

      {deliveries.length === 0 ? (
        <p className={styles.sectionLede}>
          No deliveries yet. Import an issue from Overview, run Agents, then
          return here when a PR is ready for review.{" "}
          <Link href={`${base}?tab=overview`}>Start from issue</Link>
        </p>
      ) : (
        <ul className={styles.evidenceList}>
          {deliveries.map((d) => (
            <li key={d.taskId} className={styles.evidenceRow}>
              <div>
                <Link
                  href={`${base}/tasks/${d.taskId}`}
                  className={styles.evidenceTitle}
                >
                  {d.title}
                </Link>
                <p className={styles.evidenceMeta}>
                  {statusHint(d.status)}
                  {d.prUrl ? " · PR attached" : ""}
                  {" · "}
                  {d.updatedAt}
                </p>
              </div>
              <div className={styles.evidenceActions}>
                <Link
                  href={`${base}/tasks/${d.taskId}`}
                  className={styles.ghostBtn}
                >
                  Review evidence
                </Link>
                {d.prUrl ? (
                  <a
                    href={d.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.ghostBtn}
                  >
                    Open PR
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
