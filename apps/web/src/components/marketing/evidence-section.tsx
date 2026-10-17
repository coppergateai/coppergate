"use client";

import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
} from "./arena-demo-data";
import styles from "./marketing.module.css";

const winner =
  ILLUSTRATIVE_CONTENDERS.find((c) => c.statusTone === "win") ??
  ILLUSTRATIVE_CONTENDERS[0]!;

/** Compact evidence summary — deep demo lives in Arena above. */
export function EvidenceSection() {
  return (
    <section
      id="evidence"
      className={`${styles.section} ${styles.evidenceSection}`}
      aria-labelledby="evidence-title"
    >
      <div className={styles.sectionInner}>
        <header className={styles.workflowHead}>
          <p className={styles.sectionEyebrow}>Verification evidence</p>
          <h2 id="evidence-title" className={styles.sectionTitle}>
            Every winner comes with evidence.
          </h2>
          <p className={styles.sectionLede}>
            See what passed, what it cost, and why it was selected — then open
            the Arena demo for the full race.
          </p>
        </header>

        <article className={styles.deliveryReport}>
          <header className={styles.deliveryHead}>
            <div>
              <p className={styles.deliveryKicker}>Delivery report</p>
              <h3 className={styles.deliveryTitle}>
                {ILLUSTRATIVE_ARENA.task}
              </h3>
              <p className={styles.deliverySub}>
                Survivor · {winner.name} · PR #{ILLUSTRATIVE_ARENA.prNumber}
              </p>
            </div>
            <span className={styles.statusPillWin}>Selected</span>
          </header>

          <div className={styles.deliveryPrimary}>
            <div className={styles.deliveryStat}>
              <span className={styles.deliveryStatKey}>CI</span>
              <strong className={styles.deliveryStatOk}>{winner.ci}</strong>
            </div>
            <div className={styles.deliveryStat}>
              <span className={styles.deliveryStatKey}>Fitness</span>
              <strong>{winner.fitness.toFixed(2)}</strong>
            </div>
            <div className={styles.deliveryStat}>
              <span className={styles.deliveryStatKey}>Spend</span>
              <strong>{formatUsd(ILLUSTRATIVE_ARENA.totalSpendUsd)}</strong>
            </div>
            <div className={styles.deliveryStat}>
              <span className={styles.deliveryStatKey}>Efficiency</span>
              <strong>{winner.efficiency.toFixed(3)}</strong>
            </div>
          </div>

          <div className={styles.deliveryReason}>
            <p className={styles.deliveryReasonLabel}>Selection reason</p>
            <p className={styles.deliveryReasonBody}>
              {ILLUSTRATIVE_ARENA.selectionReason}
            </p>
          </div>

          <p className={styles.demoNotice}>
            <a className={styles.announceLink} href="#arena">
              Open Arena demo →
            </a>
          </p>
        </article>
      </div>
    </section>
  );
}
