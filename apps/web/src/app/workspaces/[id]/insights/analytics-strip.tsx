"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./insights.module.css";

type Analytics = {
  windowDays: number;
  totalSpendMicros: number;
  failedRunSpendMicros: number;
  acceptedPrCount: number;
  medianAcceptedPrCostMicros: number | null;
  runCount: number;
  failedRunCount: number;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
  verifiedPrsThisMonth: number;
};

function usd(micros: number | null): string {
  if (micros == null) return "—";
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function AnalyticsStrip({
  workspaceId,
  isOwner,
  verifiedPrsThisMonth,
}: Props) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOwner) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/analytics?days=30`);
    const body = (await res.json()) as {
      analytics?: Analytics;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(body.error?.message ?? "Failed to load analytics");
      return;
    }
    setData(body.analytics ?? null);
    setError(null);
  }, [workspaceId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.section} aria-labelledby="insights-30d-heading">
      <h2 id="insights-30d-heading" className={styles.sectionLabel}>
        Cost analytics (30d)
      </h2>
      <p className={styles.sectionLede}>
        Coppergate budget units and acceptance across arenas — not your
        OpenAI/BYOK provider invoice.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {isOwner ? (
        data ? (
          <div className={styles.summaryStrip} aria-label="30-day analytics">
            <p className={styles.summaryItem}>
              <strong>{usd(data.totalSpendMicros)}</strong> spend
            </p>
            <p className={styles.summaryItem}>
              <strong>{data.acceptedPrCount}</strong> accepted PRs
            </p>
            <p className={styles.summaryItem}>
              <strong>{usd(data.medianAcceptedPrCostMicros)}</strong> median / PR
            </p>
            <p className={styles.summaryItem}>
              <strong>{data.runCount}</strong> runs
            </p>
            <p className={styles.summaryItem}>
              <strong>{usd(data.failedRunSpendMicros)}</strong> failed-run spend
              <span className={styles.summaryMute}>
                {" "}
                · {data.failedRunCount} failed
              </span>
            </p>
          </div>
        ) : (
          <p className={styles.note}>Loading…</p>
        )
      ) : (
        <div className={styles.summaryStrip} aria-label="30-day analytics">
          <p className={styles.summaryItem}>
            <strong>{verifiedPrsThisMonth}</strong> verified PRs
            <span className={styles.summaryMute}> this month</span>
          </p>
          <p className={styles.summaryItem}>
            <strong>—</strong> spend
            <span className={styles.summaryMute}> · owner only</span>
          </p>
          <p className={styles.summaryItem}>
            <strong>—</strong> median / PR
            <span className={styles.summaryMute}> · owner only</span>
          </p>
        </div>
      )}
    </section>
  );
}
