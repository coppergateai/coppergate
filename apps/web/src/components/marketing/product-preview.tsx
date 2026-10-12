"use client";

import { useState } from "react";
import styles from "./marketing.module.css";

const contenders = [
  {
    id: "a",
    name: "Contender A",
    status: "Survivor",
    statusClass: "contenderStatusWin" as const,
    fitness: 0.91,
    width: "91%",
  },
  {
    id: "b",
    name: "Contender B",
    status: "Running",
    statusClass: "contenderStatus" as const,
    fitness: 0.76,
    width: "76%",
  },
  {
    id: "c",
    name: "Contender C",
    status: "Eliminated",
    statusClass: "contenderStatusOut" as const,
    fitness: 0.41,
    width: "41%",
    muted: true,
  },
] as const;

export function ProductPreview() {
  const [active, setActive] = useState("a");
  const selected = contenders.find((c) => c.id === active) ?? contenders[0];

  return (
    <div className={styles.previewShell} aria-hidden="true">
      <span className={styles.previewDemo}>Demo data</span>
      <div className={styles.previewTop}>
        <div>
          <p className={styles.previewTitle}>Subscription Tracker MVP</p>
          <p className={styles.previewRepo}>acme / subscription-tracker · #128</p>
        </div>
        <span className={styles.previewBadge}>Arena active</span>
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
                    <span className={styles[c.statusClass]}>{c.status}</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.barFill} ${"muted" in c && c.muted ? styles.barFillMuted : ""}`}
                      style={{ width: c.width }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <aside className={styles.previewSide}>
          <p className={styles.previewLabel}>Fitness · {selected.name}</p>
          <div className={styles.metricGrid}>
            <div className={styles.metric}>
              <span className={styles.metricKey}>Fitness</span>
              <span className={`${styles.metricVal} ${styles.metricWarn}`}>
                {selected.fitness.toFixed(2)}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricKey}>CI checks</span>
              <span className={`${styles.metricVal} ${styles.metricOk}`}>Passing</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricKey}>Budget used</span>
              <span className={styles.metricVal}>$18 / $50</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricKey}>Review</span>
              <span className={`${styles.metricVal} ${styles.metricOk}`}>
                Ready to promote
              </span>
            </div>
          </div>
          <div className={styles.timeline}>
            <div className={styles.timelineItem}>arena.armed · budget reserved</div>
            <div className={styles.timelineItem}>tournament.fanout · 3 contenders</div>
            <div className={styles.timelineItem}>fitness.scored · critic + CI</div>
            <div className={styles.timelineItem}>survivor.promote · PR #128</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
