"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

export type ProjectTab = "overview" | "delivery" | "arena" | "more";

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
  currency: string;
  taskCount: number;
  pendingApprovals: number;
  lastRunStatus: string | null;
  initialTab: ProjectTab;
  overview: ReactNode;
  delivery: ReactNode;
  arena: ReactNode;
  more: ReactNode;
};

function tabFromHash(hash: string): ProjectTab | null {
  const id = hash.replace(/^#/, "");
  if (id === "budget" || id === "brief") return "overview";
  if (id === "plan" || id === "board") return "delivery";
  if (id === "arena") return "arena";
  if (id === "issues" || id === "merge") return "more";
  return null;
}

function formatCap(micros: number, currency: string): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return `0 ${currency}`;
  if (dollars < 0.01) return `${dollars.toFixed(4)} ${currency}`;
  return `${dollars.toFixed(2)} ${currency}`;
}

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
  currency,
  taskCount,
  pendingApprovals,
  lastRunStatus,
  initialTab,
  overview,
  delivery,
  arena,
  more,
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
        : tab === "more"
          ? more
          : overview;

  return (
    <main className={styles.shell}>
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <h1 className={styles.pageTitle}>Project</h1>
          <span className={styles.pageName}>{name}</span>
          <div className={styles.chips}>
            <span className={styles.chip}>{repoFullName}</span>
            <span className={styles.chip}>{mode}</span>
            <span className={styles.chip}>{stack}</span>
            <span className={styles.chip}>{autonomyLevel}</span>
            <span
              className={
                budgetStatus === "paused"
                  ? `${styles.chip} ${styles.chipWarn}`
                  : styles.chip
              }
            >
              {budgetStatus === "paused" ? "Paused" : "Budget"}{" "}
              {formatCap(capMicros, currency)}
            </span>
            {pendingApprovals > 0 ? (
              <span className={`${styles.chip} ${styles.chipWarn}`}>
                {pendingApprovals} pending
              </span>
            ) : null}
            {lastRunStatus ? (
              <span className={styles.chip}>Run {lastRunStatus}</span>
            ) : null}
            {stack !== "nextjs_ts" ? (
              <span className={`${styles.chip} ${styles.chipMute}`}>
                Agent best-effort
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Project sections">
        {(
          [
            ["overview", "Overview", null],
            ["delivery", "Delivery", taskCount > 0 ? taskCount : null],
            ["arena", "Arena", null],
            ["more", "More", null],
          ] as const
        ).map(([id, label, count]) => (
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
        ))}
      </div>

      <div className={styles.tabPane} role="tabpanel">
        {pane}
      </div>
    </main>
  );
}

export function parseProjectTab(raw: string | undefined): ProjectTab {
  if (raw === "delivery" || raw === "arena" || raw === "more") return raw;
  return "overview";
}
