"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type Metrics = {
  merges: number;
  spendMicros: number;
  capMicros: number;
  spendWithinCap: boolean;
  humanTouches: number;
  autoAccepts: number;
  selfImproves: number;
  ticks: number;
};

type Policy = {
  enabled: boolean;
  monthlyBudgetMicros: number;
  autoMerge: boolean;
  autoRelease: boolean;
  selfImprove: boolean;
  communityReplies: boolean;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialEnabled: boolean;
  isOwner: boolean;
};

function dollars(micros: number) {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

export function MaintainerPanel({
  workspaceId,
  projectId,
  initialEnabled,
  isOwner,
}: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [budgetDollars, setBudgetDollars] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/maintainer?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    );
    const body = (await res.json()) as {
      error?: { message?: string };
      enabled?: boolean;
      policy?: Policy;
      metrics?: Metrics;
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? "Failed to load maintainer");
    }
    setEnabled(Boolean(body.enabled));
    if (body.policy) {
      setPolicy(body.policy);
      setBudgetDollars(
        String((body.policy.monthlyBudgetMicros / 1_000_000).toFixed(2)),
      );
    }
    if (body.metrics) setMetrics(body.metrics);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Load failed");
    });
  }, [load]);

  async function post(action: string, extra?: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/maintainer`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, action, ...extra }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        enabled?: boolean;
        policy?: Policy;
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? "Update failed");
      }
      setEnabled(Boolean(body.enabled));
      if (body.policy) setPolicy(body.policy);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="maintainer"
      className={styles.section}
      aria-labelledby="maintainer-heading"
    >
      <h2 id="maintainer-heading" className={styles.sectionLabel}>
        Autonomous maintainer
      </h2>
      <p className={styles.sectionLede}>
        Set vision + monthly budget. Agents compete, merge without your PR
        approve, release, and self-improve. Intervene only via vision, budget,
        or kill-switch. Canonical micro-envelope: $5/mo.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.checkRow} style={{ gap: "0.75rem", flexWrap: "wrap" }}>
        <label>
          Monthly budget (USD)
          <input
            type="number"
            min={1}
            step={1}
            value={budgetDollars}
            disabled={!isOwner || pending || enabled}
            onChange={(e) => setBudgetDollars(e.target.value)}
            style={{ marginLeft: "0.5rem", width: "5rem" }}
          />
        </label>
        {isOwner ? (
          enabled ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void post("disable")}
            >
              Disable maintainer mode
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const n = Number(budgetDollars);
                const micros = Number.isFinite(n)
                  ? Math.round(n * 1_000_000)
                  : 5_000_000;
                void post("enable", { monthlyBudgetMicros: micros });
              }}
            >
              Enable maintainer mode
            </button>
          )
        ) : null}
      </div>

      {policy ? (
        <ul className={styles.sectionLede} style={{ marginTop: "0.75rem" }}>
          <li>Status: {enabled ? "ON" : "off"}</li>
          <li>Envelope: {dollars(policy.monthlyBudgetMicros)} / month</li>
          <li>Auto-merge: {policy.autoMerge ? "yes" : "no"}</li>
          <li>Auto-release: {policy.autoRelease ? "yes" : "no"}</li>
          <li>Self-improve: {policy.selfImprove ? "yes" : "no"}</li>
          <li>Community replies: {policy.communityReplies ? "yes" : "no"}</li>
        </ul>
      ) : null}

      {metrics ? (
        <ul className={styles.sectionLede} style={{ marginTop: "0.5rem" }}>
          <li>
            Last 30d: {metrics.merges} merges · spend{" "}
            {dollars(metrics.spendMicros)} / {dollars(metrics.capMicros)}
            {metrics.spendWithinCap ? "" : " (over cap)"}
          </li>
          <li>
            Human PR touches: {metrics.humanTouches} · auto-accepts:{" "}
            {metrics.autoAccepts} · self-improves: {metrics.selfImproves} ·
            ticks: {metrics.ticks}
          </li>
        </ul>
      ) : null}
    </section>
  );
}
