import Link from "next/link";
import styles from "./ship-receipt.module.css";

export type ShipReceiptViewModel = {
  openId: string | null;
  title: string;
  taskId: string;
  runId: string | null;
  spendMicros: number;
  spendLabel: string;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  ci: {
    acceptReady: boolean;
    blocking: boolean;
    passed: boolean;
    checkCount: number;
  };
  winnerProfileKey: string | null;
  humanTouches: number;
  prUrl: string | null;
  prNumber: number | null;
  writeback: {
    architectureId: string | null;
    note: string;
  };
  acceptedAt: string;
  acceptedBy: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  receipt?: ShipReceiptViewModel;
  empty?: boolean;
};

export function ShipReceiptView({
  workspaceId,
  projectId,
  taskId,
  taskTitle,
  receipt,
  empty,
}: Props) {
  const taskHref = `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`;
  const evidenceHref = `/workspaces/${workspaceId}/projects/${projectId}?tab=evidence`;

  if (empty || !receipt) {
    return (
      <main className={styles.main}>
        <p className={styles.kicker}>Ship Receipt</p>
        <h1 className={styles.title}>{taskTitle}</h1>
        <p className={styles.lede}>
          No Ship Receipt yet. Accept a REVIEW_REQUIRED delivery with gates
          clear — Accept writes Done and issues this receipt against the Open
          Program ID.
        </p>
        <div className={styles.actions}>
          <Link href={taskHref} className={styles.primary}>
            Back to task
          </Link>
          <Link href={evidenceHref} className={styles.ghost}>
            Evidence
          </Link>
        </div>
      </main>
    );
  }

  const ciLabel = receipt.ci.blocking
    ? "Blocked"
    : receipt.ci.passed
      ? "Green"
      : receipt.ci.checkCount === 0
        ? "No checks"
        : "Pending";

  return (
    <main className={styles.main}>
      <p className={styles.kicker}>Ship Receipt · Contracted Autonomy</p>
      <h1 className={styles.title}>
        {receipt.openId ? (
          <>
            <span className={styles.openId}>{receipt.openId}</span>
            <span className={styles.titleRest}>
              {" "}
              · {receipt.title.replace(new RegExp(`^${receipt.openId}:\\s*`, "i"), "")}
            </span>
          </>
        ) : (
          receipt.title
        )}
      </h1>
      <p className={styles.lede}>
        Accepted {new Date(receipt.acceptedAt).toLocaleString()} — accounting
        for the Open Program line, not a chat log.
      </p>

      <dl className={styles.grid}>
        <div>
          <dt>Open ID</dt>
          <dd>{receipt.openId ?? "—"}</dd>
        </div>
        <div>
          <dt>Spend</dt>
          <dd>{receipt.spendLabel}</dd>
        </div>
        <div>
          <dt>Fitness</dt>
          <dd>
            {receipt.fitnessScore != null
              ? receipt.fitnessScore.toFixed(2)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>CI</dt>
          <dd>{ciLabel}</dd>
        </div>
        <div>
          <dt>Winner profile</dt>
          <dd>{receipt.winnerProfileKey ?? "—"}</dd>
        </div>
        <div>
          <dt>Human touches</dt>
          <dd>{receipt.humanTouches}</dd>
        </div>
        <div>
          <dt>Writeback</dt>
          <dd>{receipt.writeback.note}</dd>
        </div>
        <div>
          <dt>PR</dt>
          <dd>
            {receipt.prUrl ? (
              <a href={receipt.prUrl} target="_blank" rel="noreferrer">
                {receipt.prNumber ? `#${receipt.prNumber}` : "Open PR"}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Link href={taskHref} className={styles.primary}>
          Task detail
        </Link>
        <Link href={evidenceHref} className={styles.ghost}>
          Evidence
        </Link>
        <Link href="/docs/open-program-runtime" className={styles.ghost}>
          Open Program Runtime
        </Link>
      </div>
    </main>
  );
}
