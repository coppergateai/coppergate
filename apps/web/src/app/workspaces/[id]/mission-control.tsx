import Link from "next/link";
import type { WorkspaceMissionControl } from "@coppergate/db";
import { humanizeOpsDetail } from "@/lib/humanize-ops";
import {
  type ActivityEvent,
  type ActivityGroup,
  actorLabel,
  formatRelative,
  groupActivityEvents,
  shortId,
} from "./activity/events";
import styles from "./mission-control.module.css";

type Props = {
  data: WorkspaceMissionControl;
  recentEvents: ActivityEvent[];
};

function formatUsd(micros: number, currency: string): string {
  const dollars = micros / 1_000_000;
  const symbol = currency === "USD" ? "$" : `${currency} `;
  if (dollars === 0) return `${symbol}0`;
  if (dollars < 1) return `${symbol}${dollars.toFixed(2)}`;
  return `${symbol}${Math.round(dollars)}`;
}

function formatStamp(now = new Date()): string {
  return now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Map task/run status to a 4-step pipeline index (0–3). */
function executionStep(status: string): number {
  switch (status) {
    case "QUEUED":
    case "ARMED":
      return 0;
    case "RUNNING":
    case "Arena":
      return 1;
    case "VALIDATING":
    case "WAITING_CI":
      return 2;
    case "IN_REVIEW":
    case "REVIEW_REQUIRED":
      return 3;
    default:
      return 1;
  }
}

function statusBadgeLabel(status: string, phase: string): string {
  if (status === "VALIDATING" || status === "WAITING_CI") return "Validation";
  if (status === "QUEUED") return "Queued";
  if (status === "RUNNING") return "Running";
  if (status === "REVIEW_REQUIRED" || status === "IN_REVIEW") return "Review";
  return phase;
}

function timelineGlyph(group: ActivityGroup): string {
  if (group.outcome === "failed") return "!";
  if (group.action.includes("tournament") || group.action.includes("meta_tournament")) {
    return "◆";
  }
  if (group.category === "agent") return "●";
  if (group.category === "decision") return "▸";
  return "○";
}

function nodeClass(group: ActivityGroup): string {
  if (group.outcome === "failed") return styles.timelineNodeFail ?? "";
  if (group.outcome === "completed") return styles.timelineNodeDone ?? "";
  if (group.outcome === "running" || group.outcome === "queued") {
    return styles.timelineNodeRun ?? "";
  }
  return "";
}

function tagsFor(group: ActivityGroup): string[] {
  if (group.count > 1) return [`${group.count} events`];
  const tags: string[] = [];
  const projectName =
    typeof group.meta?.projectName === "string"
      ? group.meta.projectName
      : typeof group.meta?.repoFullName === "string"
        ? group.meta.repoFullName.split("/").pop()
        : null;
  if (projectName) {
    tags.push(projectName);
  } else if (group.targetType && group.targetId) {
    tags.push(`${group.targetType} ${shortId(group.targetId)}`);
  } else if (typeof group.meta?.projectId === "string") {
    tags.push(`project ${shortId(group.meta.projectId)}`);
  } else {
    const actor = actorLabel(group.actor);
    if (actor && !actor.startsWith("Actor ·")) tags.push(actor);
  }
  return tags.slice(0, 2);
}

export function MissionControl({ data, recentEvents }: Props) {
  const { metrics, attention, executions } = data;
  const hasBudget = metrics.budgetCapMicros > 0;
  const needsAttention = attention.length > 0;
  const budgetPaused = metrics.budgetStatus === "paused";
  const arenaHot = metrics.arenaNeedsAttention > 0;
  const opsWarn = needsAttention || budgetPaused || arenaHot;
  const recent = groupActivityEvents(recentEvents).slice(0, 8);

  const concurrencyItem = attention.find((a) => a.kind === "concurrency");
  const providerQuotaItem = attention.find((a) => a.kind === "provider_quota");
  const crisisItem = concurrencyItem || providerQuotaItem;
  const evidenceItem = attention.find((a) => a.kind === "review_required");
  const humanGates = metrics.needsApproval;
  const evidenceGates = metrics.needsEvidenceAccept;
  const attentionTotal =
    humanGates + evidenceGates + metrics.arenaNeedsAttention;
  const attentionHref =
    humanGates > 0
      ? `/workspaces/${data.workspaceId}/inbox`
      : evidenceItem
        ? evidenceItem.href
        : crisisItem || arenaHot
          ? `/workspaces/${data.workspaceId}/arena`
          : `/workspaces/${data.workspaceId}/inbox`;

  const statusLine = (() => {
    if (budgetPaused) {
      return "Budget envelope paused — executions are frozen until you raise the cap.";
    }
    if (providerQuotaItem) {
      return providerQuotaItem.detail;
    }
    if (concurrencyItem) {
      return concurrencyItem.detail;
    }
    if (evidenceGates > 0 && !arenaHot) {
      return `${evidenceGates} deliver${evidenceGates === 1 ? "y" : "ies"} ready to Accept in Evidence${humanGates > 0 ? ` · ${humanGates} inbox` : ""}.`;
    }
    if (arenaHot) {
      return `${metrics.arenaNeedsAttention} agent${metrics.arenaNeedsAttention === 1 ? "" : "s"} ${metrics.arenaNeedsAttention === 1 ? "needs" : "need"} attention in Arena${evidenceGates > 0 ? ` · ${evidenceGates} Accept` : ""}${humanGates > 0 ? ` · ${humanGates} inbox` : ""}.`;
    }
    if (needsAttention) {
      return `${attention.length} item${attention.length === 1 ? "" : "s"} need your review.`;
    }
    return "All systems operational. No items need your review.";
  })();

  const arenaItems = attention.filter((a) => a.kind === "arena_failed");
  const replanItems = attention.filter((a) => a.kind === "replan_failed");
  const otherAttention = attention.filter(
    (a) => a.kind !== "arena_failed" && a.kind !== "replan_failed",
  );
  const attentionRows: typeof attention = [];
  if (arenaItems.length > 1) {
    attentionRows.push({
      id: "arena-digest",
      kind: "arena_failed",
      title: `Arena needs attention · ${arenaItems.length} projects`,
      detail: arenaItems
        .map((a) => a.title.replace(/^Arena needs attention ·\s*/i, ""))
        .slice(0, 4)
        .join(" · "),
      href: `/workspaces/${data.workspaceId}/arena`,
      ctaLabel: "Open Arena",
      priority: "high",
    });
  } else {
    attentionRows.push(
      ...arenaItems.map((item) => ({
        ...item,
        detail: humanizeOpsDetail(item.detail),
      })),
    );
  }
  if (replanItems.length > 1) {
    attentionRows.push({
      id: "replan-digest",
      kind: "replan_failed",
      title: `Replan queue failed · ${replanItems.length} projects`,
      detail: "Maintainer could not queue the next task.",
      href:
        replanItems[0]?.href ??
        `/workspaces/${data.workspaceId}/projects`,
      ctaLabel: replanItems[0]?.ctaLabel ?? "Open project",
      priority: "high",
    });
  } else {
    attentionRows.push(
      ...replanItems.map((item) => ({
        ...item,
        detail: humanizeOpsDetail(item.detail),
      })),
    );
  }
  attentionRows.push(
    ...otherAttention.map((item) => ({
      ...item,
      detail: humanizeOpsDetail(item.detail),
    })),
  );

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <div className={styles.headLeft}>
          <p className={styles.eyebrow}>Workspace / {data.workspaceName}</p>
          <h1 className={styles.title}>Mission Control</h1>
          <p className={styles.lede}>
            Your AI engineering operations — decide next, then verify
            deliveries.
          </p>
          <div className={styles.statusRow}>
            <span
              className={`${styles.opsChip} ${opsWarn ? styles.opsChipWarn : ""}`}
            >
              <span className={styles.opsDot} aria-hidden />
              {opsWarn ? "Needs attention" : "Operational"}
            </span>
            <p className={styles.statusText}>{statusLine}</p>
          </div>
        </div>
        <div className={styles.headRight}>
          <p className={styles.stamp}>{formatStamp()}</p>
          <Link
            href={`/workspaces/${data.workspaceId}/arena`}
            className={styles.arenaCta}
          >
            Open Arena →
          </Link>
        </div>
      </header>

      <div className={styles.summaryStrip} aria-label="Workspace metrics">
        <p className={styles.summaryItem}>
          <Link
            href={`/workspaces/${data.workspaceId}/arena`}
            className={styles.summaryLink}
          >
            <strong>{metrics.arenaRunning}</strong> running
          </Link>
          <span className={styles.summaryMute}>
            · {metrics.arenaAwaitingCi} awaiting CI
            {metrics.activeRuns >
            metrics.arenaRunning + metrics.arenaAwaitingCi
              ? ` · ${metrics.activeRuns} slots`
              : ""}
          </span>
        </p>
        <p className={styles.summaryItem}>
          <Link href={attentionHref} className={styles.summaryLink}>
            <strong>{attentionTotal}</strong> need attention
          </Link>
          <span className={styles.summaryMute}>
            · {humanGates} inbox · {evidenceGates} evidence ·{" "}
            {metrics.arenaNeedsAttention} arena
          </span>
        </p>
        <p className={styles.summaryItem}>
          <Link
            href={`/workspaces/${data.workspaceId}/projects`}
            className={styles.summaryLink}
          >
            <strong>{metrics.verifiedPrsThisMonth}</strong> verified PRs
          </Link>
          <span className={styles.summaryMute}> this month</span>
        </p>
        <p className={styles.summaryItem}>
          <Link
            href={`/workspaces/${data.workspaceId}/settings?tab=billing`}
            className={styles.summaryLink}
          >
            <strong>
              {hasBudget
                ? formatUsd(
                    metrics.budgetAvailableMicros,
                    metrics.budgetCurrency,
                  )
                : "—"}
            </strong>{" "}
            available
          </Link>
          {hasBudget ? (
            <span className={styles.summaryMute}>
              · reserved{" "}
              {formatUsd(
                metrics.budgetReservedMicros,
                metrics.budgetCurrency,
              )}{" "}
              / {formatUsd(metrics.budgetCapMicros, metrics.budgetCurrency)}
              {budgetPaused ? " · paused" : ""}
            </span>
          ) : null}
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.stack}>
          <section
            className={styles.panel}
            aria-labelledby="attention-heading"
          >
            <div className={styles.panelHead}>
              <h2 id="attention-heading" className={styles.sectionTitle}>
                Needs your attention
              </h2>
              <p className={styles.sectionMeta}>
                {attentionRows.length} pending
              </p>
            </div>
            {attentionRows.length === 0 ? (
              <div className={styles.emptyCatch}>
                <span className={styles.emptyIcon} aria-hidden>
                  ✓
                </span>
                <p className={styles.emptyTitle}>You&apos;re all caught up</p>
                <p className={styles.emptyBody}>
                  No approvals, failed arena runs, or blockers. Next spend needs
                  an Open Program ID —{" "}
                  <Link href={`/workspaces/${data.workspaceId}/arena`}>
                    Arena
                  </Link>{" "}
                  cannot reserve without one when the program is bound.
                </p>
              </div>
            ) : (
              <ul className={styles.list}>
                {attentionRows.map((item) => {
                  const isCrisis =
                    item.kind === "concurrency" ||
                    item.kind === "provider_quota";
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className={`${styles.attentionRow} ${
                          isCrisis ? styles.attentionCrisis : ""
                        }`}
                      >
                        <div className={styles.attentionTop}>
                          <p className={styles.rowTitle}>
                            {item.title}
                            {item.priority === "high" ? (
                              <span className={styles.priority}>High</span>
                            ) : null}
                          </p>
                          {item.ctaLabel ? (
                            <span
                              className={
                                isCrisis
                                  ? styles.attentionCtaPrimary
                                  : styles.attentionCta
                              }
                            >
                              {item.ctaLabel} →
                            </span>
                          ) : null}
                        </div>
                        <p className={styles.rowDetail}>{item.detail}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="activity-heading">
            <div className={styles.panelHead}>
              <h2 id="activity-heading" className={styles.sectionTitle}>
                Recent activity
              </h2>
              <Link
                href={`/workspaces/${data.workspaceId}/activity`}
                className={styles.sectionLink}
              >
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className={styles.emptyCatch}>
                <p className={styles.emptyTitle}>No activity yet</p>
                <p className={styles.emptyBody}>
                  Agent executions, decisions, and signals will appear here.
                </p>
              </div>
            ) : (
              <ul className={styles.timeline}>
                {recent.map((g) => {
                  const body = (
                    <>
                      <div className={styles.timelineTop}>
                        <p className={styles.timelineTitle}>
                          {g.title}
                          {g.count > 1 && g.kind === "collapse"
                            ? ` ×${g.count}`
                            : ""}
                        </p>
                        <span className={styles.timelineTime}>
                          {formatRelative(g.createdAt)}
                        </span>
                      </div>
                      {g.summary ? (
                        <p className={styles.timelineSummary}>{g.summary}</p>
                      ) : null}
                      <div className={styles.tags}>
                        {tagsFor(g).map((t) => (
                          <span key={t} className={styles.tag}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </>
                  );
                  return (
                    <li key={g.key} className={styles.timelineItem}>
                      <div className={styles.timelineRail}>
                        <span
                          className={`${styles.timelineNode} ${nodeClass(g)}`}
                          aria-hidden
                        >
                          {timelineGlyph(g)}
                        </span>
                      </div>
                      {g.href ? (
                        <Link href={g.href} className={styles.timelineBody}>
                          {body}
                        </Link>
                      ) : (
                        <div className={styles.timelineBody}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className={styles.stack}>
          <section className={styles.panel} aria-labelledby="exec-heading">
            <div className={styles.panelHead}>
              <h2 id="exec-heading" className={styles.sectionTitle}>
                Active executions
              </h2>
              <p className={styles.sectionMeta}>
                {executions.length === 0
                  ? "Idle"
                  : `${executions.length} in pipeline`}
              </p>
            </div>
            {executions.length === 0 ? (
              <div className={styles.emptyCatch}>
                <p className={styles.emptyTitle}>No active executions</p>
                <p className={styles.emptyBody}>
                  No Open ID, no spend. Bind an Open Program line, then open{" "}
                  <Link href={`/workspaces/${data.workspaceId}/arena`}>
                    Arena
                  </Link>{" "}
                  to license the next reserve.
                </p>
              </div>
            ) : (
              <ul className={styles.execList}>
                {executions.map((ex) => {
                  const step = executionStep(ex.status);
                  const badge = statusBadgeLabel(ex.status, ex.phase);
                  const active =
                    ex.status === "RUNNING" ||
                    ex.status === "VALIDATING" ||
                    ex.status === "WAITING_CI";
                  return (
                    <li key={`${ex.projectId}-${ex.taskId ?? ex.status}`}>
                      <Link href={ex.href} className={styles.execCard}>
                        <div className={styles.execHead}>
                          <p className={styles.execProject}>{ex.projectName}</p>
                          <span
                            className={`${styles.execBadge} ${
                              active
                                ? styles.execBadgeActive
                                : styles.execBadgeQueued
                            }`}
                          >
                            {badge}
                          </span>
                        </div>
                        <p className={styles.execTitle}>
                          {ex.taskTitle ?? "Execution"}
                        </p>
                        <div className={styles.steps} aria-hidden>
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`${styles.step} ${
                                i < step
                                  ? styles.stepDone
                                  : i === step
                                    ? styles.stepCurrent
                                    : ""
                              }`}
                            >
                              <span className={styles.stepDot} />
                            </span>
                          ))}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="actions-heading">
            <div className={styles.panelHead}>
              <h2 id="actions-heading" className={styles.sectionTitle}>
                Quick actions
              </h2>
            </div>
            <div className={styles.actions}>
              {crisisItem ? (
                <Link
                  href={crisisItem.href}
                  className={`${styles.action} ${styles.actionPrimary}`}
                >
                  <span className={styles.actionIcon} aria-hidden>
                    ■
                  </span>
                  <span className={styles.actionLabel}>
                    {providerQuotaItem ? "Open Arena" : "Pause Arena"}
                  </span>
                </Link>
              ) : (
                <Link
                  href={`/workspaces/${data.workspaceId}/arena`}
                  className={styles.action}
                >
                  <span className={styles.actionIcon} aria-hidden>
                    ◆
                  </span>
                  <span className={styles.actionLabel}>Open Arena</span>
                </Link>
              )}
              {metrics.needsApproval > 0 ? (
                <Link
                  href={`/workspaces/${data.workspaceId}/inbox`}
                  className={styles.action}
                >
                  <span className={styles.actionIcon} aria-hidden>
                    ▣
                  </span>
                  <span className={styles.actionLabel}>
                    Review inbox ({metrics.needsApproval})
                  </span>
                </Link>
              ) : evidenceItem ? (
                <Link href={evidenceItem.href} className={styles.action}>
                  <span className={styles.actionIcon} aria-hidden>
                    ✓
                  </span>
                  <span className={styles.actionLabel}>
                    Accept evidence ({evidenceGates})
                  </span>
                </Link>
              ) : (
                <Link
                  href={`/workspaces/${data.workspaceId}/projects`}
                  className={styles.action}
                >
                  <span className={styles.actionIcon} aria-hidden>
                    ▷
                  </span>
                  <span className={styles.actionLabel}>
                    Import issue → queue
                  </span>
                </Link>
              )}
              <Link
                href={`/workspaces/${data.workspaceId}/projects`}
                className={styles.action}
              >
                <span className={styles.actionIcon} aria-hidden>
                  ▤
                </span>
                <span className={styles.actionLabel}>View projects</span>
              </Link>
              <Link
                href={`/workspaces/${data.workspaceId}/settings`}
                className={styles.action}
              >
                <span className={styles.actionIcon} aria-hidden>
                  ⚙
                </span>
                <span className={styles.actionLabel}>Workspace settings</span>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
