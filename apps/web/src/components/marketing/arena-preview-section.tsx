"use client";

import { useState } from "react";
import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
  type IllustrativeContender,
} from "./arena-demo-data";
import styles from "./marketing.module.css";

function toneClass(tone: IllustrativeContender["statusTone"]) {
  if (tone === "win") return styles.statusPillWin;
  if (tone === "out") return styles.statusPillOut;
  if (tone === "reject") return styles.statusPillReject;
  return styles.statusPillRun;
}

export function ArenaPreviewSection() {
  const [activeId, setActiveId] = useState("a");
  const fallback = ILLUSTRATIVE_CONTENDERS[0]!;
  const selected =
    ILLUSTRATIVE_CONTENDERS.find((c) => c.id === activeId) ?? fallback;
  const winner = ILLUSTRATIVE_CONTENDERS.find((c) => c.statusTone === "win");
  const isWinner = Boolean(winner && selected.id === winner.id);

  return (
    <section
      id="arena"
      className={`${styles.section} ${styles.arenaSection}`}
      aria-labelledby="arena-title"
    >
      <div className={styles.sectionInner}>
        <header className={styles.workflowHead}>
          <p className={styles.sectionEyebrow}>The Arena</p>
          <h2 id="arena-title" className={styles.sectionTitle}>
            Contenders compete. One survivor ships.
          </h2>
          <p className={styles.sectionLede}>
            A bounded tournament around one engineering task. Contenders
            attempt the work; Coppergate verifies results, prices spend, and
            promotes the strongest qualifying path.
          </p>
          <p className={styles.demoNotice}>
            <span className={styles.demoNoticeMark}>
              {ILLUSTRATIVE_ARENA.label}
            </span>
            Sample metrics — not a live run.
          </p>
        </header>

        <div className={styles.arenaBoard}>
          <div className={styles.arenaBoardHead}>
            <div>
              <p className={styles.arenaTaskLabel}>Task</p>
              <h3 className={styles.arenaTask}>{ILLUSTRATIVE_ARENA.task}</h3>
              <p className={styles.arenaRepo}>{ILLUSTRATIVE_ARENA.repo}</p>
            </div>
            <p className={styles.arenaHeadQuiet}>
              {formatUsd(ILLUSTRATIVE_ARENA.totalSpendUsd)} of{" "}
              {formatUsd(ILLUSTRATIVE_ARENA.budgetUsd)} ·{" "}
              {ILLUSTRATIVE_ARENA.duration} · {ILLUSTRATIVE_ARENA.runState}
            </p>
          </div>

          <div className={styles.arenaGrid}>
            <div className={styles.arenaCompare}>
              <p className={styles.arenaColLabel}>Comparison</p>
              <ul className={styles.arenaContenders} role="list">
                {ILLUSTRATIVE_CONTENDERS.map((c) => {
                  const selectedRow = activeId === c.id;
                  const win = c.statusTone === "win";
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`${styles.arenaRow} ${
                          selectedRow ? styles.arenaRowActive : ""
                        } ${win ? styles.arenaRowWin : ""} ${
                          c.muted ? styles.arenaRowMuted : ""
                        }`}
                        onClick={() => setActiveId(c.id)}
                        aria-pressed={selectedRow}
                      >
                        <span className={styles.arenaRowName}>{c.name}</span>
                        <span className={styles.arenaRowMetric}>
                          <span className={styles.arenaRowMetricKey}>
                            Fitness
                          </span>
                          {c.fitness.toFixed(2)}
                        </span>
                        <span className={styles.arenaRowMetric}>
                          <span className={styles.arenaRowMetricKey}>Cost</span>
                          {formatUsd(c.spendUsd)}
                        </span>
                        <span className={styles.arenaRowMetric}>
                          <span className={styles.arenaRowMetricKey}>
                            Efficiency
                          </span>
                          {c.efficiency.toFixed(3)}
                        </span>
                        <span
                          className={`${styles.statusPill} ${toneClass(c.statusTone)}`}
                        >
                          {c.status}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className={styles.arenaDetail} aria-live="polite">
              <p className={styles.arenaColLabel}>{selected.name}</p>

              <div className={styles.arenaVerifyBlock}>
                <h4>Verification</h4>
                <ul className={styles.checkList}>
                  <li>
                    <span
                      className={
                        selected.ci === "Passing"
                          ? styles.checkOk
                          : styles.checkBad
                      }
                    />
                    CI {selected.ci}
                  </li>
                  <li>
                    <span
                      className={
                        selected.testsFailed > 0
                          ? styles.checkBad
                          : styles.checkOk
                      }
                    />
                    Tests · {selected.tests}
                  </li>
                  <li>
                    <span
                      className={
                        selected.lint === "Failed"
                          ? styles.checkBad
                          : selected.lint === "Warnings"
                            ? styles.checkWarn
                            : styles.checkOk
                      }
                    />
                    Lint · {selected.lint}
                  </li>
                  <li>
                    <span
                      className={
                        selected.policy === "Compliant"
                          ? styles.checkOk
                          : styles.checkBad
                      }
                    />
                    Policy · {selected.policy}
                  </li>
                </ul>
              </div>

              {isWinner ? (
                <div className={styles.selectionCallout}>
                  <p className={styles.selectionCalloutLabel}>
                    Why this survivor
                  </p>
                  <p className={styles.selectionCalloutBody}>
                    {ILLUSTRATIVE_ARENA.selectionReason}
                  </p>
                </div>
              ) : selected.rejectionReason ? (
                <div className={styles.selectionCalloutMuted}>
                  <p className={styles.selectionCalloutLabel}>Not promoted</p>
                  <p className={styles.selectionCalloutBody}>
                    {selected.rejectionReason}
                  </p>
                </div>
              ) : null}

              <div className={styles.arenaNext}>
                <p className={styles.arenaColLabel}>What happens next</p>
                <p className={styles.arenaNextBody}>
                  {isWinner
                    ? `PR #${ILLUSTRATIVE_ARENA.prNumber} is ready for review on ${ILLUSTRATIVE_ARENA.branch}. Merge stays policy-gated.`
                    : selected.promote}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
