"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

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
};

function usd(micros: number | null): string {
  if (micros == null) return "—";
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function AnalyticsPanel({ workspaceId, isOwner }: Props) {
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

  if (!isOwner) return null;

  return (
    <section className={styles.section} aria-labelledby="analytics-heading">
      <h2 id="analytics-heading" className={styles.sectionLabel}>
        Cost analytics (30d)
      </h2>
      <p className={styles.sectionLede}>
        Spend and acceptance across arenas in this workspace.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {data ? (
        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total spend</p>
            <p className={styles.statValue}>{usd(data.totalSpendMicros)}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Median accepted PR</p>
            <p className={styles.statValue}>
              {usd(data.medianAcceptedPrCostMicros)}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Accepted PRs</p>
            <p className={styles.statValue}>{data.acceptedPrCount}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Failed run spend</p>
            <p className={styles.statValue}>
              {usd(data.failedRunSpendMicros)}
            </p>
            <p className={styles.statHint}>{data.failedRunCount} failed runs</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Runs</p>
            <p className={styles.statValue}>{data.runCount}</p>
          </div>
        </div>
      ) : (
        <p className={styles.note}>Loading…</p>
      )}
    </section>
  );
}
