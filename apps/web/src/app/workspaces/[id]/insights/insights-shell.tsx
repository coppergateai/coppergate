"use client";

import Link from "next/link";
import { AnalyticsStrip } from "./analytics-strip";
import { CostByProject } from "./cost-by-project";
import { SignalSpend } from "./signal-spend";
import styles from "./insights.module.css";

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
          <Link
            href={`/workspaces/${workspaceId}`}
            className={styles.headLink}
          >
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

      <div className={styles.stack}>
        <AnalyticsStrip
          workspaceId={workspaceId}
          isOwner={isOwner}
          verifiedPrsThisMonth={verifiedPrsThisMonth}
        />

        <CostByProject workspaceId={workspaceId} />

        <SignalSpend workspaceId={workspaceId} isOwner={isOwner} />

        <section
          className={styles.section}
          aria-labelledby="verified-delivery-heading"
        >
          <h2 id="verified-delivery-heading" className={styles.sectionLabel}>
            Verified delivery
          </h2>
          <p className={styles.sectionLede}>
            North-star context for this month. Ship receipts and ops detail live
            on Activity and Delivery Review.
          </p>
          <div className={styles.summaryStrip} aria-label="Verified delivery">
            <p className={styles.summaryItem}>
              <strong>{verifiedPrsThisMonth}</strong> verified PRs
              <span className={styles.summaryMute}> this month</span>
            </p>
          </div>
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
      </div>
    </main>
  );
}
