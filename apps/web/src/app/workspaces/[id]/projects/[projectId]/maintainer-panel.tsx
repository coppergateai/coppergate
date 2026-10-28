"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  describeL2AutoMerge,
  describeMaintainerSettingsHonesty,
} from "@coppergate/db";
import styles from "./project-detail.module.css";

type Metrics = {
  merges: number;
  spendMicros: number;
  capMicros: number;
  spendWithinCap: boolean;
  humanTouches: number;
  autoAccepts: number;
  selfImproves: number;
  metaTournaments?: number;
  replans?: number;
  costPerAcceptedMergeMicros?: number;
  winningProfileKeys?: string[];
  ticks: number;
};

type Policy = {
  enabled: boolean;
  monthlyBudgetMicros: number;
  autoMerge: boolean;
  autoRelease: boolean;
  selfImprove: boolean;
  communityReplies: boolean;
  communityScout?: boolean;
  communityScoutIntervalHours?: number;
  communityScoutMaxPerRun?: number;
  autoQueueReplanTasks?: boolean;
  releaseTagStyle?: string;
  maxTournamentN?: number;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialEnabled: boolean;
  initialAutonomy: string;
  initialMergeEnabled: boolean;
  isOwner: boolean;
};

function dollars(micros: number) {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

function yn(value: boolean | undefined, fallback = true): string {
  if (value === undefined) return fallback ? "Yes" : "No";
  return value ? "Yes" : "No";
}

export function MaintainerPanel({
  workspaceId,
  projectId,
  initialEnabled,
  initialAutonomy,
  initialMergeEnabled,
  isOwner,
}: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [autonomy, setAutonomy] = useState(initialAutonomy);
  const [mergeEnabled, setMergeEnabled] = useState(initialMergeEnabled);
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

  useEffect(() => {
    setAutonomy(initialAutonomy);
    setMergeEnabled(initialMergeEnabled);
  }, [initialAutonomy, initialMergeEnabled]);

  const maintainerHonesty = useMemo(
    () =>
      describeMaintainerSettingsHonesty({
        maintainerEnabled: enabled,
      }),
    [enabled],
  );

  const mergeHonesty = useMemo(
    () =>
      describeL2AutoMerge({
        autonomyLevel: autonomy,
        mergeEnabled,
        maintainerEnabled: enabled,
        maintainerAutoMerge: policy?.autoMerge ?? true,
      }),
    [autonomy, mergeEnabled, enabled, policy?.autoMerge],
  );

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
      if (typeof body.enabled === "boolean") setEnabled(body.enabled);
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
      <div className={styles.sectionHead}>
        <h2 id="maintainer-heading" className={styles.sectionLabel}>
          Autonomous maintainer
        </h2>
        <span
          className={
            enabled
              ? `${styles.statusPill} ${styles.statusPillActive}`
              : `${styles.statusPill} ${styles.statusPillPaused}`
          }
        >
          {enabled ? "On" : "Off"}
        </span>
      </div>
      <p className={styles.sectionLede}>
        Start in Arena invents vision and backlog. While the monthly envelope
        allows, the worker keeps shipping. Cap hit → hard pause. Enabling
        maintainer turns on L2 + merge + min_human — it is not unattended
        production deploy.
      </p>
      <p className={styles.hint}>{maintainerHonesty.notProdDeployLine}</p>
      <ul className={styles.hint}>
        {maintainerHonesty.failClosedLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {enabled ? (
        <p className={styles.hint} role="status">
          L2 auto-merge (maintainer tick):{" "}
          {mergeHonesty.maintainerPathActive ? "active" : "inactive"} —{" "}
          {mergeHonesty.maintainerSummary}
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.btnRow}>
        <label className={styles.field}>
          Monthly budget (USD)
          <input
            className={styles.inputNarrow}
            type="number"
            min={1}
            step={1}
            value={budgetDollars}
            disabled={!isOwner || pending || enabled}
            onChange={(e) => setBudgetDollars(e.target.value)}
          />
        </label>
        {isOwner ? (
          enabled ? (
            <>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={pending}
                onClick={() => void post("disable")}
              >
                Disable
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={pending}
                title="After fixing GitHub branch protection / CODEOWNERS, clear sticky merge.blocked so the worker retries"
                onClick={() => void post("clear_merge_blocked")}
              >
                Clear merge blocks
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={pending}
              onClick={() => {
                const n = Number(budgetDollars);
                const micros = Number.isFinite(n)
                  ? Math.round(n * 1_000_000)
                  : 5_000_000;
                void post("enable", { monthlyBudgetMicros: micros });
              }}
            >
              Enable maintainer
            </button>
          )
        ) : null}
      </div>

      <p className={styles.hint}>
        Merge blocked by GitHub? Add the Coppergate App to PR review bypass (or
        approve as CODEOWNER), then Clear merge blocks. Coppergate never
        bypasses protection itself.
      </p>

      {policy ? (
        <details className={styles.configFold} open>
          <summary className={styles.configFoldSummary}>Policy</summary>
          <dl className={styles.configGrid}>
            <div>
              <dt>Envelope</dt>
              <dd>{dollars(policy.monthlyBudgetMicros)} / mo</dd>
            </div>
            <div>
              <dt>Auto-merge</dt>
              <dd>{yn(policy.autoMerge)}</dd>
            </div>
            <div>
              <dt>Auto-release</dt>
              <dd>{yn(policy.autoRelease)}</dd>
            </div>
            <div>
              <dt>Auto-queue replan</dt>
              <dd>{yn(policy.autoQueueReplanTasks !== false)}</dd>
            </div>
            <div>
              <dt>Release tags</dt>
              <dd>{policy.releaseTagStyle ?? "daily"}</dd>
            </div>
            <div>
              <dt>Self-improve</dt>
              <dd>{yn(policy.selfImprove)}</dd>
            </div>
            <div>
              <dt>Tournament N</dt>
              <dd>{policy.maxTournamentN ?? 2}</dd>
            </div>
            <div>
              <dt>Community replies</dt>
              <dd>{yn(policy.communityReplies)}</dd>
            </div>
            <div>
              <dt>Community scout</dt>
              <dd>
                {policy.communityScout === false
                  ? "Off"
                  : `Every ${policy.communityScoutIntervalHours ?? 8}h · max ${policy.communityScoutMaxPerRun ?? 2}/run`}
              </dd>
            </div>
          </dl>
        </details>
      ) : null}

      {metrics ? (
        <details className={styles.configFold}>
          <summary className={styles.configFoldSummary}>
            Last 30 days · {metrics.merges} merges
          </summary>
          <dl className={styles.configGrid}>
            <div>
              <dt>Spend</dt>
              <dd>
                {dollars(metrics.spendMicros)} / {dollars(metrics.capMicros)}
                {metrics.spendWithinCap ? "" : " · over cap"}
              </dd>
            </div>
            {metrics.costPerAcceptedMergeMicros != null && metrics.merges > 0 ? (
              <div>
                <dt>Per merge</dt>
                <dd>~{dollars(metrics.costPerAcceptedMergeMicros)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Human touches</dt>
              <dd>{metrics.humanTouches}</dd>
            </div>
            <div>
              <dt>Auto-accepts</dt>
              <dd>{metrics.autoAccepts}</dd>
            </div>
            <div>
              <dt>Self-improves</dt>
              <dd>{metrics.selfImproves}</dd>
            </div>
            <div>
              <dt>Meta duels</dt>
              <dd title="Champion vs challenger strategy applied to arena">
                {metrics.metaTournaments ?? 0}
              </dd>
            </div>
            <div>
              <dt>Replans</dt>
              <dd>{metrics.replans ?? 0}</dd>
            </div>
            <div>
              <dt>Ticks</dt>
              <dd>{metrics.ticks}</dd>
            </div>
            {metrics.winningProfileKeys &&
            metrics.winningProfileKeys.length > 0 ? (
              <div className={styles.configGridWide}>
                <dt>Winning profiles</dt>
                <dd>{metrics.winningProfileKeys.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
