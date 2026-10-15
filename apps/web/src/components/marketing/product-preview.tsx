"use client";

import { useState } from "react";
import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
} from "./arena-demo-data";
import styles from "./marketing.module.css";

type Props = {
  /** Slimmer chrome for the hero column. */
  compact?: boolean;
};

function toneClass(tone: string) {
  if (tone === "win") return styles.statusPillWin;
  if (tone === "out") return styles.statusPillOut;
  if (tone === "reject") return styles.statusPillReject;
  return styles.statusPillRun;
}

export function ProductPreview({ compact = false }: Props) {
  const [active, setActive] = useState("a");
  const fallback = ILLUSTRATIVE_CONTENDERS[0]!;
  const selected =
    ILLUSTRATIVE_CONTENDERS.find((c) => c.id === active) ?? fallback;

  return (
    <div
      className={`${styles.previewShell} ${compact ? styles.previewCompact : ""}`}
      aria-hidden="true"
    >
      <span className={styles.previewDemo}>{ILLUSTRATIVE_ARENA.label}</span>

      <div className={styles.previewChrome}>
        <div className={styles.previewDots}>
          <span />
          <span />
          <span />
        </div>
        <p className={styles.previewCrumb}>
          Arena <span>/</span> Checkout race
        </p>
        <span className={styles.previewBadge}>Illustrative</span>
      </div>

      <div className={styles.previewTop}>
        <div>
          <p className={styles.previewTitle}>{ILLUSTRATIVE_ARENA.task}</p>
          <p className={styles.previewRepo}>
            {ILLUSTRATIVE_ARENA.repo} · goal bound · kill-switch armed
          </p>
        </div>
        <div className={styles.previewBudgetChip}>
          <span>Budget</span>
          <strong>
            {formatUsd(ILLUSTRATIVE_ARENA.totalSpendUsd)} /{" "}
            {formatUsd(ILLUSTRATIVE_ARENA.budgetUsd)}
          </strong>
        </div>
      </div>

      <div className={styles.previewBody}>
        <div className={styles.previewMain}>
          <p className={styles.previewLabel}>Contenders</p>
          <ul className={styles.contenderList}>
            {ILLUSTRATIVE_CONTENDERS.map((c) => (
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
                      className={`${styles.statusPill} ${toneClass(c.statusTone)}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className={styles.contenderMeta}>
                    <span className={styles.contenderFitness}>
                      {c.fitness.toFixed(2)}
                    </span>
                    <span className={styles.contenderSpend}>
                      {formatUsd(c.spendUsd)}
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.barFill} ${c.muted ? styles.barFillMuted : ""}`}
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
                  selected.testsFailed > 0 ? styles.checkBad : styles.checkOk
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

          <div className={styles.promoteLine}>
            <span>Outcome</span>
            <strong>{selected.promote}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
