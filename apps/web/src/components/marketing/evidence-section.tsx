"use client";

import { useState } from "react";
import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
} from "./arena-demo-data";
import styles from "./marketing.module.css";

const winner =
  ILLUSTRATIVE_CONTENDERS.find((c) => c.statusTone === "win") ??
  ILLUSTRATIVE_CONTENDERS[0]!;
const rejected = ILLUSTRATIVE_CONTENDERS.filter((c) => c.id !== winner.id);

export function EvidenceSection() {
  const [open, setOpen] = useState(false);

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
            See what was built, what passed, what it cost, and why it was
            selected. Promotion is an inspectable report — not a black box.
          </p>
          <p className={styles.demoNotice}>
            <span className={styles.demoNoticeMark}>
              {ILLUSTRATIVE_ARENA.label}
            </span>
            Sample report layout — not live operational data.
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
                Survivor · {winner.name} · PR #{ILLUSTRATIVE_ARENA.prNumber}{" "}
                ready for review
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
              <span className={styles.deliveryStatKey}>Tests</span>
              <strong className={styles.deliveryStatOk}>
                {winner.testsPassed} passed
              </strong>
            </div>
            <div className={styles.deliveryStat}>
              <span className={styles.deliveryStatKey}>Fitness</span>
              <strong>{winner.fitness.toFixed(2)}</strong>
            </div>
            <div className={styles.deliveryStat}>
              <span className={styles.deliveryStatKey}>Spend</span>
              <strong>{formatUsd(ILLUSTRATIVE_ARENA.totalSpendUsd)}</strong>
            </div>
          </div>

          <div className={styles.deliveryReason}>
            <p className={styles.deliveryReasonLabel}>Selection reason</p>
            <p className={styles.deliveryReasonBody}>
              {ILLUSTRATIVE_ARENA.selectionReason}
            </p>
          </div>

          <div className={styles.deliveryExpand}>
            <button
              type="button"
              className={styles.deliveryExpandBtn}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span>View execution details</span>
              <span aria-hidden="true">{open ? "−" : "+"}</span>
            </button>
            {open ? (
              <div className={styles.deliveryDetails}>
                <dl className={styles.deliveryDetailGrid}>
                  <div>
                    <dt>Repository</dt>
                    <dd>{ILLUSTRATIVE_ARENA.repo}</dd>
                  </div>
                  <div>
                    <dt>Branch</dt>
                    <dd>
                      <code>{ILLUSTRATIVE_ARENA.branch}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Commit</dt>
                    <dd>
                      <code>{ILLUSTRATIVE_ARENA.commitSha}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Changed files</dt>
                    <dd>checkout.ts · cart-lock.ts · checkout.test.ts</dd>
                  </div>
                  <div>
                    <dt>Lint</dt>
                    <dd>{winner.lint}</dd>
                  </div>
                  <div>
                    <dt>Policy</dt>
                    <dd>{winner.policy}</dd>
                  </div>
                  <div>
                    <dt>Efficiency</dt>
                    <dd>{winner.efficiency.toFixed(3)}</dd>
                  </div>
                  <div>
                    <dt>Criteria</dt>
                    <dd>{ILLUSTRATIVE_ARENA.criteria.join(" · ")}</dd>
                  </div>
                  <div>
                    <dt>Budget</dt>
                    <dd>
                      {formatUsd(ILLUSTRATIVE_ARENA.totalSpendUsd)} /{" "}
                      {formatUsd(ILLUSTRATIVE_ARENA.budgetUsd)}
                    </dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{ILLUSTRATIVE_ARENA.duration}</dd>
                  </div>
                  <div>
                    <dt>Attempts</dt>
                    <dd>{ILLUSTRATIVE_ARENA.attempts} contenders</dd>
                  </div>
                  <div>
                    <dt>Others</dt>
                    <dd>
                      {rejected
                        .map((c) => `${c.name}: ${c.rejectionReason}`)
                        .join(" · ")}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
