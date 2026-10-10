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
      const dollars = Number(capDollars);
      if (!Number.isFinite(dollars) || dollars < 0) {
        throw new Error("Enter a valid non-negative dollar amount");
      }
      const capMicros = Math.round(dollars * 1_000_000);
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

  return (
    <section className={styles.section} aria-labelledby="budget-heading">
      <h2 id="budget-heading" className={styles.sectionLabel}>
        Budget
      </h2>
      <p className={styles.sectionLede}>
        Cap {usage.capMicros / 1_000_000} {usage.currency} · spent{" "}
        {usage.spentMicros / 1_000_000} · reserved{" "}
        {usage.reservedMicros / 1_000_000} · available{" "}
        {usage.availableMicros / 1_000_000} · {usage.budgetStatus}
      </p>
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
                void save(usage.budgetStatus === "paused" ? "active" : "paused")
              }
            >
              {usage.budgetStatus === "paused" ? "Resume spend" : "Pause spend"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
