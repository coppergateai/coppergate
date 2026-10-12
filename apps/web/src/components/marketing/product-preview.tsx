"use client";

import { useState } from "react";
import styles from "./marketing.module.css";

const contenders = [
  {
    id: "a",
    name: "Contender A",
    status: "Survivor",
    statusTone: "win" as const,
    fitness: 0.91,
    spend: 14.2,
    ci: "Passing",
    tests: "42 passed",
    policy: "Compliant",
    promote: "Ready · PR #128",
  },
  {
    id: "b",
    name: "Contender B",
    status: "Running",
    statusTone: "run" as const,
    fitness: 0.76,
    spend: 11.8,
    ci: "Passing",
    tests: "38 passed",
    policy: "Compliant",
    promote: "Competing",
  },
  {
    id: "c",
    name: "Contender C",
    status: "Eliminated",
    statusTone: "out" as const,
    fitness: 0.41,
    spend: 9.4,
    ci: "Failed",
    tests: "3 failed",
    policy: "Blocked path",
    promote: "Stopped",
    muted: true,
  },
] as const;

const tabs = ["Overview", "Contenders", "Evidence", "Delivery"] as const;

const timeline = [
  { id: "armed", label: "Arena armed", state: "done" as const },
  { id: "fanout", label: "Tournament", state: "done" as const },
  { id: "fitness", label: "Fitness", state: "active" as const },
  { id: "promote", label: "Survivor", state: "next" as const },
];

export function ProductPreview() {
  const [active, setActive] = useState("a");
  const selected = contenders.find((c) => c.id === active) ?? contenders[0];

  return (
    <div className={styles.previewShell} aria-hidden="true">
      <span className={styles.previewDemo}>Demo data</span>

      <div className={styles.previewChrome}>
        <div className={styles.previewDots}>
          <span />
          <span />
          <span />
        </div>
        <p className={styles.previewCrumb}>
          Arena <span>/</span> Subscription Tracker
        </p>
        <span className={styles.previewBadge}>Live · demo</span>
      </div>

      <div className={styles.previewTabs}>
        {tabs.map((tab) => (
          <span
            key={tab}
            className={
              tab === "Contenders"
                ? `${styles.previewTab} ${styles.previewTabActive}`
                : styles.previewTab
            }
          >
            {tab}
          </span>
        ))}
      </div>

      <div className={styles.previewTop}>
        <div>
          <p className={styles.previewTitle}>Subscription Tracker MVP</p>
          <p className={styles.previewRepo}>
            acme / subscription-tracker · goal bound · kill-switch armed
          </p>
        </div>
        <div className={styles.previewBudgetChip}>
          <span>Budget</span>
          <strong>$35.4 / $50</strong>
        </div>
      </div>

      <div className={styles.previewBody}>
        <div className={styles.previewMain}>
          <p className={styles.previewLabel}>Contenders</p>
          <ul className={styles.contenderList}>
            {contenders.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`${styles.contender} ${active === c.id ? styles.contenderActive : ""}`}
                  onClick={() => setActive(c.id)}
                  tabIndex={-1}
                >
                  <div className={styles.contenderTop}>
                    <span className={styles.contenderName}>{c.name}</span>
                    <span
                      className={`${styles.statusPill} ${
                        c.statusTone === "win"
                          ? styles.statusPillWin
                          : c.statusTone === "out"
                            ? styles.statusPillOut
                            : styles.statusPillRun
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className={styles.contenderMeta}>
                    <span className={styles.contenderFitness}>
                      {c.fitness.toFixed(2)}
                    </span>
                    <span className={styles.contenderSpend}>${c.spend}</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      key={`${active}-${c.id}`}
                      className={`${styles.barFill} ${"muted" in c && c.muted ? styles.barFillMuted : ""}`}
                      style={{ width: `${Math.round(c.fitness * 100)}%` }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <aside className={styles.previewSide} key={selected.id}>
          <p className={styles.previewLabel}>Fitness detail</p>
          <div className={styles.fitnessHero}>
            <span className={styles.fitnessHeroLabel}>{selected.name}</span>
            <strong className={styles.fitnessHeroScore}>
              {selected.fitness.toFixed(2)}
            </strong>
          </div>

          <ul className={styles.checkList}>
            <li>
              <span
                className={
                  selected.ci === "Passing" ? styles.checkOk : styles.checkBad
                }
              />
              CI {selected.ci}
            </li>
            <li>
              <span
                className={
                  selected.tests.includes("failed")
                    ? styles.checkBad
                    : styles.checkOk
                }
              />
              Tests · {selected.tests}
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

          <div className={styles.budgetBlock}>
            <div className={styles.budgetTop}>
              <span>Spend</span>
              <span>
                ${selected.spend.toFixed(1)} used · $12.0 reserved · $50 total
              </span>
            </div>
            <div className={styles.barTrack}>
              <div
                key={`budget-${selected.id}`}
                className={styles.barFill}
                style={{ width: `${(selected.spend / 50) * 100}%` }}
              />
            </div>
          </div>

          <div className={styles.promoteLine}>
            <span>Promotion</span>
            <strong>{selected.promote}</strong>
          </div>
        </aside>
      </div>

      <div className={styles.pipeline}>
        {timeline.map((node, i) => (
          <div
            key={node.id}
            className={`${styles.pipelineNode} ${
              node.state === "active"
                ? styles.pipelineActive
                : node.state === "done"
                  ? styles.pipelineDone
                  : styles.pipelineNext
            }`}
          >
            {i > 0 ? <span className={styles.pipelineWire} /> : null}
            <span className={styles.pipelineDot} />
            <span className={styles.pipelineLabel}>{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
