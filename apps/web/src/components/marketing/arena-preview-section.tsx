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
            An Arena is a bounded tournament around a single engineering task.
            Each contender produces an attempt; Coppergate verifies results,
            prices spend, and promotes the strongest qualifying path.
          </p>
          <p className={styles.demoNotice}>
            <span className={styles.demoNoticeMark}>{ILLUSTRATIVE_ARENA.label}</span>
            Sample metrics below show how selection reads in product UI — not a
            live run.
          </p>
        </header>

        <div className={styles.arenaBoard}>
          <div className={styles.arenaBoardHead}>
            <div>
              <p className={styles.arenaTaskLabel}>Task</p>
              <h3 className={styles.arenaTask}>{ILLUSTRATIVE_ARENA.task}</h3>
              <p className={styles.arenaRepo}>
                {ILLUSTRATIVE_ARENA.repo} · {ILLUSTRATIVE_ARENA.branch}
              </p>
            </div>
            <dl className={styles.arenaHeadStats}>
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
                <dt>State</dt>
                <dd>{ILLUSTRATIVE_ARENA.runState}</dd>
              </div>
            </dl>
          </div>

          <div className={styles.arenaGrid}>
            <ul className={styles.arenaContenders} role="list">
              {ILLUSTRATIVE_CONTENDERS.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`${styles.arenaCard} ${
                      activeId === c.id ? styles.arenaCardActive : ""
                    } ${c.muted ? styles.arenaCardMuted : ""}`}
                    onClick={() => setActiveId(c.id)}
                    aria-pressed={activeId === c.id}
                  >
                    <div className={styles.arenaCardTop}>
                      <span className={styles.arenaCardName}>{c.name}</span>
                      <span
                        className={`${styles.statusPill} ${toneClass(c.statusTone)}`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <dl className={styles.arenaMetrics}>
                      <div>
                        <dt>Fitness</dt>
                        <dd>{c.fitness.toFixed(2)}</dd>
                      </div>
                      <div>
                        <dt>Cost</dt>
                        <dd>{formatUsd(c.spendUsd)}</dd>
                      </div>
                      <div>
                        <dt>Efficiency</dt>
                        <dd>{c.efficiency.toFixed(3)}</dd>
                      </div>
                      <div>
                        <dt>Tests</dt>
                        <dd>
                          {c.testsPassed} passed
                          {c.testsFailed > 0 ? ` · ${c.testsFailed} failed` : ""}
                        </dd>
                      </div>
                    </dl>
                    {c.rejectionReason ? (
                      <p className={styles.arenaReject}>{c.rejectionReason}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>

            <aside className={styles.arenaDetail} aria-live="polite">
              <p className={styles.previewLabel}>Inspecting {selected.name}</p>
              <dl className={styles.arenaDetailList}>
                <div>
                  <dt>CI</dt>
                  <dd>{selected.ci}</dd>
                </div>
                <div>
                  <dt>Tests</dt>
                  <dd>{selected.tests}</dd>
                </div>
                <div>
                  <dt>Lint</dt>
                  <dd>{selected.lint}</dd>
                </div>
                <div>
                  <dt>Policy</dt>
                  <dd>{selected.policy}</dd>
                </div>
                <div>
                  <dt>Fitness</dt>
                  <dd>{selected.fitness.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Spend</dt>
                  <dd>{formatUsd(selected.spendUsd)}</dd>
                </div>
                <div>
                  <dt>Efficiency e = f / spend^α</dt>
                  <dd>{selected.efficiency.toFixed(3)}</dd>
                </div>
              </dl>

              {winner && selected.id === winner.id ? (
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
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
