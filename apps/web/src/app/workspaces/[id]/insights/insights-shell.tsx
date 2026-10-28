"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/ui";
import {
  DonutChart,
  HorizontalBars,
  SpendSplitBar,
  usd,
} from "./charts";
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

type CostData = {
  windowDays: number;
  spentMicros: number;
  projects: Array<{
    projectId: string;
    name: string;
    spentMicros: number;
  }>;
};

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
  workspaceName: string;
  isOwner: boolean;
  verifiedPrsThisMonth: number;
};

export function InsightsShell({
  workspaceId,
  workspaceName,
  isOwner,
  verifiedPrsThisMonth,
}: Props) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);
  const [signals, setSignals] = useState<SignalAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const costRes = await fetch(`/api/workspaces/${workspaceId}/cost?days=7`);
      const costBody = (await costRes.json()) as {
        cost?: CostData;
        error?: { message?: string };
      };
      if (!costRes.ok) {
        throw new Error(costBody.error?.message ?? "Failed to load cost");
      }
      setCost(costBody.cost ?? null);

      if (isOwner) {
        const [aRes, sRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/analytics?days=30`),
          fetch(`/api/workspaces/${workspaceId}/signals/analytics?days=30`),
        ]);
        const aBody = (await aRes.json()) as {
          analytics?: Analytics;
          error?: { message?: string };
        };
        const sBody = (await sRes.json()) as {
          analytics?: SignalAnalytics;
          error?: { message?: string };
        };
        if (!aRes.ok) {
          throw new Error(aBody.error?.message ?? "Failed to load analytics");
        }
        setAnalytics(aBody.analytics ?? null);
        if (sRes.ok) setSignals(sBody.analytics ?? null);
      } else {
        setAnalytics(null);
        setSignals(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const productiveSpend = analytics
    ? Math.max(0, analytics.totalSpendMicros - analytics.failedRunSpendMicros)
    : 0;
  const succeededRuns = analytics
    ? Math.max(0, analytics.runCount - analytics.failedRunCount)
    : 0;
  const failRate =
    analytics && analytics.runCount > 0
      ? Math.round((analytics.failedRunCount / analytics.runCount) * 100)
      : 0;

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <div className={styles.headLeft}>
          <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
          <h1 className={styles.title}>Insights</h1>
          <p className={styles.lede}>
            Period economics and verified delivery — what shipped and what it
            cost, not what needs intervention now.
          </p>
        </div>
        <div className={styles.headRight}>
          <Link href={`/workspaces/${workspaceId}`} className={styles.headLink}>
            ← Mission Control
          </Link>
          <Link
            href={`/workspaces/${workspaceId}/settings?tab=billing`}
            className={styles.headLink}
          >
            Manage budget →
          </Link>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.note}>Loading insights…</p> : null}

      {!loading ? (
        <>
          <section
            className={styles.kpiGrid}
            aria-label="Period key metrics"
          >
            <article className={styles.kpi}>
              <p className={styles.kpiLabel}>Spend (30d)</p>
              <p className={styles.kpiValue}>
                {isOwner && analytics
                  ? usd(analytics.totalSpendMicros)
                  : isOwner
                    ? "—"
                    : "Owner only"}
              </p>
              <p className={styles.kpiHint}>
                {isOwner && analytics
                  ? `${usd(analytics.failedRunSpendMicros)} on failed runs`
                  : "Coppergate budget units"}
              </p>
            </article>
            <article className={styles.kpi}>
              <p className={styles.kpiLabel}>Accepted PRs</p>
              <p className={styles.kpiValue}>
                {isOwner && analytics ? analytics.acceptedPrCount : "—"}
              </p>
              <p className={styles.kpiHint}>
                {isOwner && analytics
                  ? `median ${usd(analytics.medianAcceptedPrCostMicros)} / PR`
                  : "30-day acceptances"}
              </p>
            </article>
            <article className={styles.kpi}>
              <p className={styles.kpiLabel}>Verified PRs</p>
              <p className={styles.kpiValue}>{verifiedPrsThisMonth}</p>
              <p className={styles.kpiHint}>this month · north star</p>
            </article>
            <article className={`${styles.kpi} ${styles.kpiAccent}`}>
              <p className={styles.kpiLabel}>Run fail rate</p>
              <p className={styles.kpiValue}>
                {isOwner && analytics ? `${failRate}%` : "—"}
              </p>
              <p className={styles.kpiHint}>
                {isOwner && analytics
                  ? `${analytics.failedRunCount} of ${analytics.runCount} runs`
                  : "Owner-only analytics"}
              </p>
            </article>
          </section>

          <div className={styles.board}>
            <section
              className={styles.panel}
              aria-labelledby="project-spend-heading"
            >
              <div className={styles.panelHead}>
                <h2 id="project-spend-heading" className={styles.sectionLabel}>
                  Spend by project
                </h2>
                <p className={styles.panelWindow}>7d</p>
              </div>
              <p className={styles.sectionLede}>
                Coppergate budget units by project — not your provider invoice.
              </p>
              {cost && cost.projects.length > 0 ? (
                <>
                  <p className={styles.panelTotal}>
                    Workspace total{" "}
                    <strong>{usd(cost.spentMicros)}</strong>
                  </p>
                  <HorizontalBars
                    ariaLabel="Spend by project"
                    items={cost.projects.slice(0, 8).map((p) => ({
                      id: p.projectId,
                      label: p.name,
                      value: p.spentMicros,
                      href: `/workspaces/${workspaceId}/projects/${p.projectId}`,
                    }))}
                  />
                </>
              ) : (
                <EmptyState
                  title="No usage in this window"
                  body="No project spend in the last 7 days."
                />
              )}
            </section>

            <section
              className={styles.panel}
              aria-labelledby="run-outcomes-heading"
            >
              <div className={styles.panelHead}>
                <h2 id="run-outcomes-heading" className={styles.sectionLabel}>
                  Run outcomes
                </h2>
                <p className={styles.panelWindow}>30d</p>
              </div>
              <p className={styles.sectionLede}>
                How many arena runs completed versus failed — and where spend
                went.
              </p>
              {isOwner && analytics ? (
                <div className={styles.outcomeRow}>
                  <DonutChart
                    ariaLabel="Run success versus failure"
                    centerValue={`${succeededRuns}`}
                    centerLabel="completed"
                    parts={[
                      {
                        label: "Completed",
                        value: succeededRuns,
                        tone: "ok",
                      },
                      {
                        label: "Failed",
                        value: analytics.failedRunCount,
                        tone: "bad",
                      },
                    ]}
                  />
                  <div className={styles.outcomeAside}>
                    <SpendSplitBar
                      primary={productiveSpend}
                      secondary={analytics.failedRunSpendMicros}
                      primaryLabel="Other spend"
                      secondaryLabel="Failed-run spend"
                    />
                    <ul className={styles.outcomeStats}>
                      <li>
                        <strong>{analytics.runCount}</strong>
                        <span>total runs</span>
                      </li>
                      <li>
                        <strong>{analytics.failedRunCount}</strong>
                        <span>failed</span>
                      </li>
                      <li>
                        <strong>{usd(analytics.failedRunSpendMicros)}</strong>
                        <span>failed-run spend</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title={isOwner ? "No run data yet" : "Owner-only chart"}
                  body={
                    isOwner
                      ? "Run outcome charts appear after arena activity."
                      : "Ask a workspace owner for period run analytics."
                  }
                />
              )}
            </section>
          </div>

          <section
            className={styles.panel}
            aria-labelledby="signal-spend-heading"
          >
            <div className={styles.panelHead}>
              <h2 id="signal-spend-heading" className={styles.sectionLabel}>
                Signal spend
              </h2>
              <p className={styles.panelWindow}>30d</p>
            </div>
            <p className={styles.sectionLede}>
              Spend attributed to inbound signals by provider.
            </p>
            {!isOwner ? (
              <p className={styles.note}>Available to workspace owners.</p>
            ) : signals && signals.rows.length > 0 ? (
              <>
                <p className={styles.panelTotal}>
                  {signals.totalSignals} signals · {signals.totalArmed} armed
                </p>
                <HorizontalBars
                  ariaLabel="Signal spend by provider"
                  items={signals.rows.map((row) => ({
                    id: row.provider,
                    label: row.provider,
                    value: row.spendMicros,
                    meta: `${row.signalCount} sig · ${row.armedCount} armed`,
                  }))}
                />
              </>
            ) : (
              <EmptyState
                title="No signal spend"
                body="No inbound signals in this window — nothing to attribute."
              />
            )}
          </section>

          <section
            className={`${styles.panel} ${styles.verifiedPanel}`}
            aria-labelledby="verified-delivery-heading"
          >
            <div className={styles.verifiedLayout}>
              <div>
                <h2
                  id="verified-delivery-heading"
                  className={styles.sectionLabel}
                >
                  Verified delivery
                </h2>
                <p className={styles.sectionLede}>
                  North-star count for this month. Ship receipts live on Activity
                  and Delivery Review.
                </p>
                <p className={styles.note}>
                  <Link
                    href={`/workspaces/${workspaceId}/projects`}
                    className={styles.footerLink}
                  >
                    View projects
                  </Link>
                  <span className={styles.footerMute}> · </span>
                  <Link
                    href={`/workspaces/${workspaceId}/activity`}
                    className={styles.footerLink}
                  >
                    View activity
                  </Link>
                </p>
              </div>
              <div className={styles.verifiedHero} aria-label="Verified PRs">
                <strong>{verifiedPrsThisMonth}</strong>
                <span>verified PRs</span>
              </div>
            </div>
          </section>

          <div className={styles.footerActions}>
            <a
              href={`/api/workspaces/${workspaceId}/cost?days=31&format=csv`}
              className={styles.footerLink}
              download
            >
              Export CSV (31d)
            </a>
            <Link
              href={`/workspaces/${workspaceId}/settings?tab=billing`}
              className={styles.footerLink}
            >
              Manage budget → Settings · Billing
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
