"use client";

import styles from "./insights.module.css";

export function usd(micros: number | null): string {
  if (micros == null) return "—";
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

type BarItem = {
  id: string;
  label: string;
  value: number;
  href?: string;
  meta?: string;
};

type HorizontalBarsProps = {
  items: BarItem[];
  formatValue?: (n: number) => string;
  ariaLabel: string;
};

/** Horizontal proportional bars — no chart lib. */
export function HorizontalBars({
  items,
  formatValue = usd,
  ariaLabel,
}: HorizontalBarsProps) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={styles.barList} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const pct = Math.max(2, (item.value / max) * 100);
        const row = (
          <>
            <div className={styles.barMeta}>
              <span className={styles.barLabel}>{item.label}</span>
              <span className={styles.barValue}>
                {formatValue(item.value)}
                {item.meta ? (
                  <span className={styles.barMetaMute}> · {item.meta}</span>
                ) : null}
              </span>
            </div>
            <div className={styles.barTrack} aria-hidden>
              <div
                className={styles.barFill}
                style={{
                  width: `${pct}%`,
                  animationDelay: `${index * 60}ms`,
                }}
              />
            </div>
          </>
        );
        return (
          <li key={item.id} className={styles.barRow}>
            {item.href ? (
              <a href={item.href} className={styles.barLink}>
                {row}
              </a>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

type DonutProps = {
  parts: Array<{ label: string; value: number; tone: "ok" | "bad" | "mute" }>;
  centerLabel: string;
  centerValue: string;
  ariaLabel: string;
};

/** SVG donut for categorical split. */
export function DonutChart({
  parts,
  centerLabel,
  centerValue,
  ariaLabel,
}: DonutProps) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const size = 160;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const toneClass = (tone: DonutProps["parts"][number]["tone"]) => {
    if (tone === "ok") return styles.donutOk;
    if (tone === "bad") return styles.donutBad;
    return styles.donutMute;
  };

  return (
    <div className={styles.donutWrap} aria-label={ariaLabel}>
      <svg
        className={styles.donutSvg}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
      >
        <circle
          className={styles.donutTrack}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        {total > 0
          ? parts
              .filter((p) => p.value > 0)
              .map((part) => {
                const len = (part.value / total) * c;
                const el = (
                  <circle
                    key={part.label}
                    className={`${styles.donutSeg} ${toneClass(part.tone)}`}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += len;
                return el;
              })
          : null}
      </svg>
      <div className={styles.donutCenter}>
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}

type SplitBarProps = {
  primary: number;
  secondary: number;
  primaryLabel: string;
  secondaryLabel: string;
};

/** Stacked spend split (productive vs failed-run). */
export function SpendSplitBar({
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
}: SplitBarProps) {
  const total = primary + secondary;
  const pPct = total > 0 ? (primary / total) * 100 : 50;
  const sPct = total > 0 ? (secondary / total) * 100 : 50;
  return (
    <div className={styles.splitBlock}>
      <div
        className={styles.splitTrack}
        role="img"
        aria-label={`${primaryLabel} ${usd(primary)}, ${secondaryLabel} ${usd(secondary)}`}
      >
        <div
          className={styles.splitPrimary}
          style={{ width: `${Math.max(pPct, total === 0 ? 50 : 0)}%` }}
        />
        <div
          className={styles.splitSecondary}
          style={{ width: `${Math.max(sPct, total === 0 ? 50 : 0)}%` }}
        />
      </div>
      <div className={styles.splitLegend}>
        <span className={styles.legendOk}>
          <i aria-hidden />
          {primaryLabel} · {usd(primary)}
        </span>
        <span className={styles.legendBad}>
          <i aria-hidden />
          {secondaryLabel} · {usd(secondary)}
        </span>
      </div>
    </div>
  );
}
