"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/ui";
import styles from "./insights.module.css";

type SignalAnalytics = {
  windowDays: number;
  totalSignals: number;
  totalArmed: number;
  rows: Array<{
    provider: string;
    signalCount: number;
    armedCount: number;
    spendMicros: number;
  }>;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
};

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function SignalSpend({ workspaceId, isOwner }: Props) {
  const [data, setData] = useState<SignalAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOwner) return;
    const res = await fetch(
      `/api/workspaces/${workspaceId}/signals/analytics?days=30`,
    );
    const body = (await res.json()) as {
      analytics?: SignalAnalytics;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(body.error?.message ?? "Failed to load signal spend");
      return;
    }
    setData(body.analytics ?? null);
    setError(null);
  }, [workspaceId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOwner) {
    return (
      <section className={styles.section} aria-labelledby="signal-spend-heading">
        <h2 id="signal-spend-heading" className={styles.sectionLabel}>
          Signal spend (30d)
        </h2>
        <p className={styles.sectionLede}>
          Spend attributed to inbound signals by provider.
        </p>
        <p className={styles.note}>
          Signal spend is available to workspace owners.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="signal-spend-heading">
      <h2 id="signal-spend-heading" className={styles.sectionLabel}>
        Signal spend (30d)
      </h2>
      <p className={styles.sectionLede}>
        Spend attributed to inbound signals by provider.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {data ? (
        data.rows.length === 0 ? (
          <EmptyState
            title="No signal spend"
            body="No inbound signals in this window — nothing to attribute."
          />
        ) : (
          <>
            <p className={styles.note}>
              {data.totalSignals} signals · {data.totalArmed} armed
            </p>
            <ul className={styles.costList}>
              {data.rows.map((row) => (
                <li key={row.provider} className={styles.costRow}>
                  <span className={styles.costLink}>{row.provider}</span>
                  <span>
                    {usd(row.spendMicros)}
                    <span className={styles.summaryMute}>
                      {" "}
                      · {row.signalCount} sig · {row.armedCount} armed
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        <p className={styles.note}>Loading…</p>
      )}
    </section>
  );
}
