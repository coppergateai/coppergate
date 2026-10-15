"use client";

import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
} from "./arena-demo-data";
import styles from "./marketing.module.css";

type Props = {
  compact?: boolean;
};

function toneClass(tone: string) {
  if (tone === "win") return styles.statusPillWin;
  if (tone === "out") return styles.statusPillOut;
  if (tone === "reject") return styles.statusPillReject;
  return styles.statusPillRun;
}

export function ProductPreview({ compact = false }: Props) {
  const winner =
    ILLUSTRATIVE_CONTENDERS.find((c) => c.statusTone === "win") ??
    ILLUSTRATIVE_CONTENDERS[0]!;

  return (
    <div
      className={`${styles.previewShell} ${compact ? styles.previewCompact : ""}`}
      aria-hidden="true"
    >
      <span className={styles.previewDemo}>{ILLUSTRATIVE_ARENA.label}</span>

      <div className={styles.previewChrome}>
        <p className={styles.previewCrumb}>
          Arena <span>/</span> Checkout race
        </p>
        <span className={styles.previewBadge}>Illustrative</span>
      </div>

      <div className={styles.previewTop}>
        <div>
          <p className={styles.previewTitle}>{ILLUSTRATIVE_ARENA.task}</p>
          <p className={styles.previewRepo}>{ILLUSTRATIVE_ARENA.repo}</p>
        </div>
      </div>

      <ul className={styles.previewContenders}>
        {ILLUSTRATIVE_CONTENDERS.map((c) => {
          const isWinner = c.id === winner.id;
          return (
            <li
              key={c.id}
              className={`${styles.previewRow} ${
                isWinner ? styles.previewRowWin : ""
              } ${c.muted ? styles.previewRowMuted : ""}`}
            >
              <div className={styles.previewRowTop}>
                <span className={styles.previewRowName}>{c.name}</span>
                <span
                  className={`${styles.statusPill} ${toneClass(c.statusTone)}`}
                >
                  {c.status}
                </span>
              </div>
              <div className={styles.previewRowMeta}>
                <span>
                  Fitness <strong>{c.fitness.toFixed(2)}</strong>
                </span>
                <span>
                  Cost <strong>{formatUsd(c.spendUsd)}</strong>
                </span>
                <span>
                  Eff <strong>{c.efficiency.toFixed(3)}</strong>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.previewReason}>
        <p className={styles.previewReasonLabel}>Why {winner.name}</p>
        <p className={styles.previewReasonBody}>
          {ILLUSTRATIVE_ARENA.selectionReason}
        </p>
      </div>
    </div>
  );
}
