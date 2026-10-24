import Link from "next/link";
import type { WorkspaceMissionControl } from "@coppergate/db";
import styles from "./mission-control.module.css";

type Props = {
  data: WorkspaceMissionControl;
};

function formatUsd(micros: number, currency: string): string {
  const dollars = micros / 1_000_000;
  const symbol = currency === "USD" ? "$" : `${currency} `;
  if (dollars === 0) return `${symbol}0`;
  if (dollars < 1) return `${symbol}${dollars.toFixed(2)}`;
  return `${symbol}${Math.round(dollars)}`;
}

export function MissionControl({ data }: Props) {
  const { metrics, attention, executions } = data;
  const hasBudget = metrics.budgetCapMicros > 0;
  const operational =
    metrics.needsApproval > 0 ||
    metrics.activeRuns > 0 ||
    metrics.budgetStatus === "paused";

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / Overview</p>
        <h1 className={styles.title}>Mission Control</h1>
        <p className={styles.lede}>
          Your AI engineering operations — decide next, then verify deliveries.
        </p>
        <span className={styles.opsChip}>
          <span
            className={`${styles.opsDot} ${operational ? styles.opsDotWarn : ""}`}
            aria-hidden
          />
          {operational ? "Needs attention" : "Operational"}
        </span>
      </header>

      <div className={styles.metrics} aria-label="Workspace metrics">
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Active runs</p>
          <p className={styles.metricValue}>
            {String(metrics.activeRuns).padStart(2, "0")}
          </p>
          <p className={styles.metricMeta}>
            {metrics.activeRunProjects}{" "}
            {metrics.activeRunProjects === 1 ? "project" : "projects"}
          </p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Needs approval</p>
          <p className={styles.metricValue}>
            {String(metrics.needsApproval).padStart(2, "0")}
          </p>
          <p className={styles.metricMeta}>
            {metrics.highPriorityApprovals} high priority
          </p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Verified PRs</p>
          <p className={styles.metricValue}>
            {String(metrics.verifiedPrsThisMonth).padStart(2, "0")}
          </p>
          <p className={styles.metricMeta}>This month</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Budget used</p>
          <p className={styles.metricValue}>
            {hasBudget
              ? formatUsd(metrics.budgetSpentMicros, metrics.budgetCurrency)
              : "—"}
          </p>
          <p className={styles.metricMeta}>
            {hasBudget
              ? `of ${formatUsd(metrics.budgetCapMicros, metrics.budgetCurrency)}`
              : "No envelope set"}
            {metrics.budgetStatus === "paused" ? " · Paused" : ""}
          </p>
        </div>
      </div>

      <div className={styles.columns}>
        <section aria-labelledby="attention-heading">
          <h2 id="attention-heading" className={styles.sectionTitle}>
            Needs your attention
          </h2>
          <p className={styles.sectionMeta}>
            {attention.length} pending
          </p>
          {attention.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Clear queue</p>
              <p className={styles.emptyBody}>
                No approvals or blockers.{" "}
                <Link href={`/workspaces/${data.workspaceId}/projects`}>
                  Open projects
                </Link>{" "}
                to start the next verified delivery.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {attention.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className={styles.row}>
                    <p className={styles.rowTitle}>
                      {item.title}
                      {item.priority === "high" ? (
                        <span className={styles.priority}>High</span>
                      ) : null}
                    </p>
                    <p className={styles.rowDetail}>{item.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="exec-heading">
          <h2 id="exec-heading" className={styles.sectionTitle}>
            Active executions
          </h2>
          <p className={styles.sectionMeta}>
            In-flight tasks and arena lanes
          </p>
          {executions.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No active executions</p>
              <p className={styles.emptyBody}>
                Import an issue or open{" "}
                <Link href={`/workspaces/${data.workspaceId}/arena`}>
                  Arena
                </Link>{" "}
                when you are ready to run agents.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {executions.map((ex) => (
                <li key={`${ex.projectId}-${ex.taskId ?? ex.status}`}>
                  <Link href={ex.href} className={styles.row}>
                    <div className={styles.execHead}>
                      <p className={styles.execProject}>{ex.projectName}</p>
                      <p className={styles.execPhase}>{ex.phase}</p>
                    </div>
                    <p className={styles.rowTitle}>
                      {ex.taskTitle ?? "Execution"}
                    </p>
                    <p className={styles.rowDetail}>{ex.status}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
