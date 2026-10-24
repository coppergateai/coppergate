"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/app/ui";
import styles from "./project-detail.module.css";
import { type ProjectTab } from "./project-tabs";

export type { ProjectTab } from "./project-tabs";

type Props = {
  workspaceId: string;
  projectId: string;
  name: string;
  repoFullName: string;
  mode: string;
  stack: string;
  autonomyLevel: string;
  budgetStatus: string;
  capMicros: number;
  availableMicros?: number;
  projectSpentMicros?: number;
  pooled?: boolean;
  currency: string;
  /** In-flight delivery work (excludes draft / done / cancelled noise). */
  deliveryCount: number;
  /** Deliveries waiting on human Accept / gate review. */
  evidenceCount: number;
  pendingApprovals: number;
  lastRunStatus: string | null;
  initialTab: ProjectTab;
  overview: ReactNode;
  delivery: ReactNode;
  arena: ReactNode;
  evidence: ReactNode;
  configuration: ReactNode;
};

function tabFromHash(hash: string): ProjectTab | null {
  const id = hash.replace(/^#/, "");
  if (id === "budget" || id === "brief" || id === "issues") return "overview";
  if (id === "plan" || id === "board") return "delivery";
  if (id === "arena") return "arena";
  if (id === "evidence") return "evidence";
  if (id === "merge" || id === "policy" || id === "repos" || id === "more") {
    return "configuration";
  }
  return null;
}

function formatCap(micros: number, currency: string): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return `0 ${currency}`;
  if (dollars < 0.01) return `${dollars.toFixed(4)} ${currency}`;
  return `${dollars.toFixed(2)} ${currency}`;
}

function formatStack(stack: string): string {
  const map: Record<string, string> = {
    nextjs_ts: "Next.js",
    node: "Node",
    python: "Python",
    go: "Go",
    ruby: "Ruby",
    shell: "Shell",
    html: "HTML",
    unknown: "Unknown",
  };
  return map[stack.toLowerCase()] ?? stack.replace(/_/g, " ");
}

function formatMode(mode: string): string {
  if (mode === "existing_repo") return "Existing repo";
  if (mode === "new_product") return "New product";
  return mode.replace(/_/g, " ");
}

const TABS: Array<{
  id: ProjectTab;
  label: string;
  countKey?: "delivery" | "evidence";
}> = [
  { id: "overview", label: "Overview" },
  { id: "delivery", label: "Delivery", countKey: "delivery" },
  { id: "arena", label: "Arena" },
  { id: "evidence", label: "Evidence", countKey: "evidence" },
  { id: "configuration", label: "Configuration" },
];

export function ProjectShell({
  workspaceId,
  projectId,
  name,
  repoFullName,
  mode,
  stack,
  autonomyLevel,
  budgetStatus,
  capMicros,
  availableMicros,
  projectSpentMicros,
  pooled,
  currency,
  deliveryCount,
  evidenceCount,
  pendingApprovals,
  lastRunStatus,
  initialTab,
  overview,
  delivery,
  arena,
  evidence,
  configuration,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<ProjectTab>(initialTab);

  useEffect(() => {
    const fromHash = tabFromHash(window.location.hash);
    if (fromHash) setTab(fromHash);
  }, []);

  const syncUrl = useCallback(
    (next: ProjectTab) => {
      const params = new URLSearchParams();
      if (next !== "overview") params.set("tab", next);
      const qs = params.toString();
      router.replace(
        `/workspaces/${workspaceId}/projects/${projectId}${qs ? `?${qs}` : ""}`,
        { scroll: false },
      );
    },
    [router, workspaceId, projectId],
  );

  function selectTab(next: ProjectTab) {
    setTab(next);
    syncUrl(next);
  }

  const pane =
    tab === "delivery"
      ? delivery
      : tab === "arena"
        ? arena
        : tab === "evidence"
          ? evidence
          : tab === "configuration"
            ? configuration
            : overview;

  const availableLabel = pooled
    ? `Available ${formatCap(availableMicros ?? 0, currency)}`
    : formatCap(capMicros, currency);

  return (
    <main className={styles.shell}>
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <Breadcrumbs
            items={[
              {
                label: "Projects",
                href: `/workspaces/${workspaceId}/projects`,
              },
              { label: name },
            ]}
          />
          <h1 className={styles.pageName}>{name}</h1>
          <p className={styles.pageSub}>
            {repoFullName}
            <span aria-hidden> · </span>
            {formatStack(stack)}
            <span aria-hidden> · </span>
            {autonomyLevel}
          </p>
          <div className={styles.chips}>
            <span
              className={
                budgetStatus === "paused"
                  ? `${styles.chip} ${styles.chipWarn}`
                  : styles.chip
              }
            >
              {budgetStatus === "paused" ? "Paused" : availableLabel}
            </span>
            {pendingApprovals > 0 ? (
              <span className={`${styles.chip} ${styles.chipWarn}`}>
                {pendingApprovals} pending
              </span>
            ) : null}
          </div>
          <details className={styles.detailsMeta}>
            <summary>Details</summary>
            <div className={styles.chips}>
              <span className={styles.chip}>{formatMode(mode)}</span>
              {lastRunStatus ? (
                <span className={styles.chip}>Run {lastRunStatus}</span>
              ) : null}
              {stack !== "nextjs_ts" ? (
                <span className={`${styles.chip} ${styles.chipMute}`}>
                  Agent best-effort
                </span>
              ) : null}
              {!pooled && projectSpentMicros != null ? (
                <span className={styles.chip}>
                  Project spend {formatCap(projectSpentMicros, currency)}
                </span>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Project sections">
        {TABS.map(({ id, label, countKey }) => {
          const count =
            countKey === "delivery" && deliveryCount > 0
              ? deliveryCount
              : countKey === "evidence" && evidenceCount > 0
                ? evidenceCount
                : null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={
                tab === id ? `${styles.tab} ${styles.tabActive}` : styles.tab
              }
              onClick={() => selectTab(id)}
            >
              {label}
              {count != null ? (
                <span className={styles.tabCount}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={styles.tabPane} role="tabpanel">
        {pane}
      </div>
    </main>
  );
}
