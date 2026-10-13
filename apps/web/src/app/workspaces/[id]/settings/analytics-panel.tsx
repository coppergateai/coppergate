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
      {error ? <p className={styles.error}>{error}</p> : null}
      {data ? (
        <ul className={styles.readOnly} style={{ listStyle: "none", padding: 0 }}>
          <li>
            Total spend: <strong>{usd(data.totalSpendMicros)}</strong>
          </li>
          <li>
            Median accepted PR:{" "}
            <strong>{usd(data.medianAcceptedPrCostMicros)}</strong>
          </li>
          <li>
            Accepted PRs: <strong>{data.acceptedPrCount}</strong>
          </li>
          <li>
            Failed run spend: <strong>{usd(data.failedRunSpendMicros)}</strong> (
            {data.failedRunCount} runs)
          </li>
          <li>
            Runs: <strong>{data.runCount}</strong>
          </li>
        </ul>
      ) : (
        <p className={styles.note}>Loading…</p>
      )}
    </section>
  );
}
