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
          <p className={styles.sectionEyebrow}>Ship Receipt</p>
          <h2 id="evidence-title" className={styles.sectionTitle}>
            Accept leaves a receipt, not a chat log.
          </h2>
          <p className={styles.sectionLede}>
            Open ID, spend, fitness, CI, and writeback travel with every Accept
            — accounting for Contracted Autonomy.
          </p>
        </header>

        <article className={styles.deliveryReport}>
          <header className={styles.deliveryHead}>
            <div>
              <p className={styles.deliveryKicker}>Ship Receipt</p>
              <h3 className={styles.deliveryTitle}>
                AG-011 · {ILLUSTRATIVE_ARENA.task}
              </h3>
              <p className={styles.deliverySub}>
                Open ID · Survivor {winner.name} · PR #
                {ILLUSTRATIVE_ARENA.prNumber}
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

          <div className={styles.sectionCtas}>
            <a className={styles.btnSecondary} href="#arena">
              Open Arena demo
            </a>
            <a
              className={styles.inlineDocLink}
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub →
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
