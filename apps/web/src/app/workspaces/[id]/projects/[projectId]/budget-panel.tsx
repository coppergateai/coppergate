"use client";

import Link from "next/link";
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
  pooled?: boolean;
  projectSpentMicros?: number;
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

  const pooled = Boolean(usage.pooled);

  async function reloadUsage() {
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
  }

  async function save(status?: "active" | "paused") {
    setPending(true);
    setError(null);
    try {
      const dollarsNum = Number(capDollars);
      if (!Number.isFinite(dollarsNum) || dollarsNum < 0) {
        throw new Error("Enter a valid non-negative dollar amount");
      }
      const capMicros = Math.round(dollarsNum * 1_000_000);
      const url = pooled
        ? `/api/workspaces/${workspaceId}/budget`
        : `/api/projects/${projectId}/budget`;
      const res = await fetch(url, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(pooled ? {} : { workspaceId }),
          capMicros,
          ...(pooled ? { period: "monthly" } : {}),
          ...(status ? { status } : {}),
        }),
      });
      const body = (await res.json()) as {
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      await reloadUsage();
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
  const projectSpent = usage.projectSpentMicros ?? usage.spentMicros;
  const reservedShare = cap > 0 ? usage.reservedMicros / cap : 0;
  const availableShare = cap > 0 ? usage.availableMicros / cap : 1;
  const showReserveAlert =
    cap > 0 && !paused && (reservedShare > 0.5 || availableShare < 0.15);
  const hasCap = usage.capMicros > 0;

  return (
    <section
      id="budget"
      className={styles.section}
      aria-labelledby="budget-heading"
    >
      <div className={styles.sectionHead}>
        <h2 id="budget-heading" className={styles.sectionLabel}>
          {pooled ? "Workspace envelope" : "Budget"}
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
        {pooled
          ? `$${dollars(usage.availableMicros)} available · this project $${dollars(projectSpent)} this period`
          : "Hard stop for agent spend. Pause blocks new worker claims."}
      </p>

      {showReserveAlert ? (
        <p className={styles.budgetAlert} role="status">
          Most of your cap is <strong>reserved</strong> by queued or running
          work.{" "}
          <strong>
            ${dollars(usage.availableMicros)} {usage.currency} available
          </strong>{" "}
          for new tasks.{" "}
          <Link
            href={`/workspaces/${workspaceId}/projects/${projectId}?tab=delivery#board`}
            className={styles.budgetAlertLink}
          >
            Review delivery
          </Link>
        </p>
      ) : null}

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
        <p className={styles.meterLegend} aria-hidden>
          <span>
            <i className={styles.legendSpent} /> Spent
          </span>
          <span>
            <i className={styles.legendReserved} /> Reserved
          </span>
          <span>
            <i className={styles.legendFree} /> Free
          </span>
        </p>
        <div className={styles.meterStats}>
          <div>
            <span className={styles.meterStatLabel}>
              {pooled ? "Workspace cap" : "Cap"}
            </span>
            <span className={styles.meterStatValue}>
              {dollars(usage.capMicros)} {usage.currency}
            </span>
          </div>
          <div>
            <span className={styles.meterStatLabel}>
              {pooled ? "Workspace spent" : "Spent"}
            </span>
            <span className={styles.meterStatValue}>
              {dollars(usage.spentMicros)}
            </span>
          </div>
          {pooled ? (
            <div>
              <span className={styles.meterStatLabel}>This project</span>
              <span className={styles.meterStatValue}>
                {dollars(projectSpent)}
              </span>
            </div>
          ) : (
            <div>
              <span className={styles.meterStatLabel}>Reserved</span>
              <span className={styles.meterStatValue}>
                {dollars(usage.reservedMicros)}
              </span>
            </div>
          )}
          <div>
            <span className={styles.meterStatLabel}>Available</span>
            <span className={styles.meterStatValue}>
              {dollars(usage.availableMicros)}
            </span>
          </div>
        </div>
        {pooled && usage.reservedMicros > 0 ? (
          <p className={styles.meterNote}>
            Reserved ${dollars(usage.reservedMicros)} across the workspace
            envelope (queued / in-flight claims).
          </p>
        ) : null}
      </div>

      {isOwner ? (
        hasCap && !paused ? (
          <details className={styles.editEnvelope}>
            <summary>Edit envelope</summary>
            <div className={styles.panel}>
              <OwnerControls
                pooled={pooled}
                capDollars={capDollars}
                setCapDollars={setCapDollars}
                pending={pending}
                paused={paused}
                usage={usage}
                workspaceId={workspaceId}
                save={save}
                setCapDollarsState={setCapDollars}
                setPending={setPending}
                setError={setError}
                reloadUsage={reloadUsage}
                router={router}
              />
            </div>
          </details>
        ) : (
          <div className={styles.panel}>
            <OwnerControls
              pooled={pooled}
              capDollars={capDollars}
              setCapDollars={setCapDollars}
              pending={pending}
              paused={paused}
              usage={usage}
              workspaceId={workspaceId}
              save={save}
              setCapDollarsState={setCapDollars}
              setPending={setPending}
              setError={setError}
              reloadUsage={reloadUsage}
              router={router}
            />
          </div>
        )
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}

function OwnerControls({
  pooled,
  capDollars,
  setCapDollars,
  pending,
  paused,
  usage,
  workspaceId,
  save,
  setCapDollarsState,
  setPending,
  setError,
  reloadUsage,
  router,
}: {
  pooled: boolean;
  capDollars: string;
  setCapDollars: (v: string) => void;
  pending: boolean;
  paused: boolean;
  usage: Usage;
  workspaceId: string;
  save: (status?: "active" | "paused") => Promise<void>;
  setCapDollarsState: (v: string) => void;
  setPending: (v: boolean) => void;
  setError: (v: string | null) => void;
  reloadUsage: () => Promise<void>;
  router: { refresh: () => void };
}) {
  return (
    <div className={styles.btnRow}>
      <label className={styles.field}>
        {pooled ? "Workspace cap (USD / mo)" : "Cap (USD)"}
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
        {pending ? "Saving…" : pooled ? "Save envelope" : "Save cap"}
      </button>
      {!pooled || usage.capMicros === 0 ? (
        <button
          type="button"
          className={styles.ghostBtn}
          disabled={pending}
          onClick={() => {
            setCapDollarsState("100.00");
            setPending(true);
            setError(null);
            void fetch(`/api/workspaces/${workspaceId}/budget`, {
              method: "PUT",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                capMicros: 100_000_000,
                period: "monthly",
                status: "active",
              }),
            })
              .then(async (res) => {
                const body = (await res.json()) as {
                  error?: { message: string };
                };
                if (!res.ok) {
                  throw new Error(body.error?.message ?? "Save failed");
                }
                await reloadUsage();
                router.refresh();
              })
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : "Save failed"),
              )
              .finally(() => setPending(false));
          }}
        >
          Set $100 envelope
        </button>
      ) : null}
      <button
        type="button"
        className={styles.ghostBtn}
        disabled={pending}
        onClick={() => void save(paused ? "active" : "paused")}
      >
        {paused ? "Resume spend" : "Pause spend"}
      </button>
    </div>
  );
}
