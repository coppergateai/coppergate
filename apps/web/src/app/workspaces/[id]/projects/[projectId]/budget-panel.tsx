"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type Usage = {
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialUsage: Usage;
  isOwner: boolean;
};

function dollars(micros: number): string {
  const d = micros / 1_000_000;
  if (d === 0) return "0";
  if (Math.abs(d) < 0.01) return d.toFixed(4);
  return d.toFixed(2);
}

export function BudgetPanel({
  workspaceId,
  projectId,
  initialUsage,
  isOwner,
}: Props) {
  const router = useRouter();
  const [usage, setUsage] = useState(initialUsage);
  const [capDollars, setCapDollars] = useState(
    String((initialUsage.capMicros / 1_000_000).toFixed(2)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(status?: "active" | "paused") {
    setPending(true);
    setError(null);
    try {
      const dollarsNum = Number(capDollars);
      if (!Number.isFinite(dollarsNum) || dollarsNum < 0) {
        throw new Error("Enter a valid non-negative dollar amount");
      }
      const capMicros = Math.round(dollarsNum * 1_000_000);
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          capMicros,
          ...(status ? { status } : {}),
        }),
      });
      const body = (await res.json()) as {
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");

      const usageRes = await fetch(
        `/api/projects/${projectId}/usage?workspaceId=${workspaceId}`,
        { credentials: "same-origin" },
      );
      const usageBody = (await usageRes.json()) as {
        usage?: Usage;
        error?: { message: string };
      };
      if (!usageRes.ok) {
        throw new Error(usageBody.error?.message ?? "Reload failed");
      }
      if (usageBody.usage) setUsage(usageBody.usage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  const cap = Math.max(usage.capMicros, 0);
  const spentPct =
    cap > 0 ? Math.min(100, (usage.spentMicros / cap) * 100) : 0;
  const reservedPct =
    cap > 0 ? Math.min(100 - spentPct, (usage.reservedMicros / cap) * 100) : 0;
  const paused = usage.budgetStatus === "paused";

  return (
    <section
      id="budget"
      className={styles.section}
      aria-labelledby="budget-heading"
    >
      <div className={styles.sectionHead}>
        <h2 id="budget-heading" className={styles.sectionLabel}>
          Budget
        </h2>
        <span
          className={
            paused
              ? `${styles.statusPill} ${styles.statusPillPaused}`
              : `${styles.statusPill} ${styles.statusPillActive}`
          }
        >
          {paused ? "Paused" : "Active"}
        </span>
      </div>
      <p className={styles.sectionLede}>
        Hard stop for agent spend. Pause blocks new worker claims.
      </p>

      <div className={styles.meterBlock}>
        <div className={styles.meterTrack} aria-hidden>
          <span
            className={styles.meterSpent}
            style={{ width: `${spentPct}%` }}
          />
          <span
            className={styles.meterReserved}
            style={{ width: `${reservedPct}%`, left: `${spentPct}%` }}
          />
        </div>
        <div className={styles.meterStats}>
          <div>
            <span className={styles.meterStatLabel}>Cap</span>
            <span className={styles.meterStatValue}>
              {dollars(usage.capMicros)} {usage.currency}
            </span>
          </div>
          <div>
            <span className={styles.meterStatLabel}>Spent</span>
            <span className={styles.meterStatValue}>
              {dollars(usage.spentMicros)}
            </span>
          </div>
          <div>
            <span className={styles.meterStatLabel}>Reserved</span>
            <span className={styles.meterStatValue}>
              {dollars(usage.reservedMicros)}
            </span>
          </div>
          <div>
            <span className={styles.meterStatLabel}>Available</span>
            <span className={styles.meterStatValue}>
              {dollars(usage.availableMicros)}
            </span>
          </div>
        </div>
      </div>

      {isOwner ? (
        <div className={styles.panel}>
          <div className={styles.btnRow}>
            <label className={styles.field}>
              Cap (USD)
              <input
                className={styles.inputNarrow}
                value={capDollars}
                onChange={(e) => setCapDollars(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={pending}
              onClick={() => void save()}
            >
              {pending ? "Saving…" : "Save cap"}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={pending}
              onClick={() =>
                void save(paused ? "active" : "paused")
              }
            >
              {paused ? "Resume spend" : "Pause spend"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
