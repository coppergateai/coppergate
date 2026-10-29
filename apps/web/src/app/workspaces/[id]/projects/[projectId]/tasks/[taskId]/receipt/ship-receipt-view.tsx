import Link from "next/link";
import { displayTaskTitle } from "@/lib/display-title";
import { ShipReceiptShareControls } from "./ship-receipt-share-controls";
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
  const displayTitle = displayTaskTitle(taskTitle) || taskTitle;

  if (empty || !receipt) {
    return (
      <main className={styles.main}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Evidence</p>
          <div className={styles.headTop}>
            <div className={styles.headText}>
              <h1 className={styles.title}>Ship Receipt</h1>
              <p className={styles.lede}>
                Accept a REVIEW_REQUIRED delivery with hard gates clear — Accept
                writes Done and issues this receipt against the Open Program ID.
              </p>
            </div>
            <nav className={styles.headLinks} aria-label="Related">
              <Link href={taskHref} className={styles.headLink}>
                Task
              </Link>
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link href={evidenceHref} className={styles.headLink}>
                Evidence
              </Link>
            </nav>
          </div>
          <div className={styles.summaryStrip} aria-label="Receipt status">
            <span className={styles.summaryItem}>
              <strong>Pending</strong> accept
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span className={styles.summaryItem}>{displayTitle}</span>
          </div>
        </header>
        <p className={styles.emptyHint}>
          No receipt for this task yet. Clear gates on Evidence, then Accept
          from the task or Arena.
        </p>
        <div className={styles.actions}>
          <Link href={taskHref} className={styles.primary}>
            Back to task
          </Link>
          <Link href={evidenceHref} className={styles.ghost}>
            Open Evidence
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

  const titleRest = receipt.openId
    ? receipt.title.replace(
        new RegExp(`^${receipt.openId}:\\s*`, "i"),
        "",
      )
    : receipt.title;

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Evidence · Contracted autonomy</p>
        <div className={styles.headTop}>
          <div className={styles.headText}>
            <h1 className={styles.title}>
              {receipt.openId ? (
                <>
                  <span className={styles.openId}>{receipt.openId}</span>
                  <span className={styles.titleRest}> · {titleRest}</span>
                </>
              ) : (
                receipt.title
              )}
            </h1>
            <p className={styles.lede}>
              Accepted {new Date(receipt.acceptedAt).toLocaleString()} — Open
              Program accounting, not a chat log.
            </p>
          </div>
          <nav className={styles.headLinks} aria-label="Related">
            <Link href={taskHref} className={styles.headLink}>
              Task
            </Link>
            <span className={styles.headSep} aria-hidden>
              ·
            </span>
            <Link href={evidenceHref} className={styles.headLink}>
              Evidence
            </Link>
            <span className={styles.headSep} aria-hidden>
              ·
            </span>
            <Link href="/docs/open-program-runtime" className={styles.headLink}>
              Docs
            </Link>
          </nav>
        </div>
        <div className={styles.summaryStrip} aria-label="Receipt summary">
          <span className={styles.summaryItem}>
            Spend <strong>{receipt.spendLabel}</strong>
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            Fitness{" "}
            <strong>
              {receipt.fitnessScore != null
                ? receipt.fitnessScore.toFixed(2)
                : "—"}
            </strong>
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            CI <strong>{ciLabel}</strong>
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            Touches <strong>{receipt.humanTouches}</strong>
          </span>
        </div>
      </header>

      <dl className={styles.dl}>
        <div className={styles.dlRow}>
          <dt>Open ID</dt>
          <dd>{receipt.openId ?? "—"}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt>Winner profile</dt>
          <dd>{receipt.winnerProfileKey ?? "—"}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt>Writeback</dt>
          <dd>{receipt.writeback.note}</dd>
        </div>
        <div className={styles.dlRow}>
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
        <div className={styles.dlRow}>
          <dt>Accepted by</dt>
          <dd>{receipt.acceptedBy || "—"}</dd>
        </div>
      </dl>

      <ShipReceiptShareControls
        workspaceId={workspaceId}
        projectId={projectId}
        taskId={taskId}
      />

      <div className={styles.actions}>
        <Link href={taskHref} className={styles.primary}>
          Task detail
        </Link>
        <Link href={evidenceHref} className={styles.ghost}>
          Evidence
        </Link>
      </div>
    </main>
  );
}
