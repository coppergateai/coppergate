"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/app/ui";
import type {
  OpenProgramBacklogItem,
  OpenProgramEffectiveStatus,
  WorkspaceOpenProgramBacklog,
} from "@coppergate/db";
import styles from "./backlog.module.css";

type StatusFilter = "all" | OpenProgramEffectiveStatus;

type Props = {
  workspaceId: string;
  workspaceName: string;
  initial: WorkspaceOpenProgramBacklog;
};

function statusLabel(status: OpenProgramEffectiveStatus): string {
  if (status === "in_flight") return "In flight";
  if (status === "done") return "Done";
  return "Open";
}

function statusClass(status: OpenProgramEffectiveStatus): string {
  if (status === "in_flight") return styles.badgeInFlight ?? "";
  if (status === "done") return styles.badgeDone ?? "";
  return styles.badgeOpen ?? "";
}

function taskHref(
  workspaceId: string,
  item: OpenProgramBacklogItem,
): string | null {
  if (!item.taskId) {
    if (item.status === "in_flight") {
      return `/workspaces/${workspaceId}/projects/${item.projectId}?tab=delivery`;
    }
    if (item.status === "open") {
      return `/workspaces/${workspaceId}/projects/${item.projectId}`;
    }
    return null;
  }
  if (item.taskStatus === "REVIEW_REQUIRED") {
    return `/workspaces/${workspaceId}/projects/${item.projectId}?tab=evidence`;
  }
  return `/workspaces/${workspaceId}/projects/${item.projectId}/tasks/${item.taskId}`;
}

function taskCta(item: OpenProgramBacklogItem): string | null {
  if (item.taskStatus === "REVIEW_REQUIRED") return "Open Evidence";
  if (item.taskId) return "Open task";
  if (item.status === "in_flight") return "Open Delivery";
  if (item.status === "open") return "Open project";
  return null;
}

export function BacklogShell({
  workspaceId,
  workspaceName,
  initial,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of initial.programs) {
      for (let i = 0; i < p.projectIds.length; i++) {
        map.set(p.projectIds[i]!, p.projectNames[i] ?? p.projectIds[i]!);
      }
    }
    for (const item of initial.items) {
      if (item.projectId) map.set(item.projectId, item.projectName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [initial]);

  const counts = useMemo(() => {
    const base = initial.items.filter((i) => i.id !== "—" || !i.fetchError);
    return {
      all: base.length,
      open: base.filter((i) => i.status === "open").length,
      in_flight: base.filter((i) => i.status === "in_flight").length,
      done: base.filter((i) => i.status === "done").length,
    };
  }, [initial.items]);

  const visible = useMemo(() => {
    return initial.items.filter((item) => {
      if (item.fetchError && item.id === "—") {
        return (
          statusFilter === "all" &&
          (projectFilter === "all" || item.projectId === projectFilter)
        );
      }
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (projectFilter !== "all" && item.projectId !== projectFilter) {
        return false;
      }
      return true;
    });
  }, [initial.items, statusFilter, projectFilter]);

  const grouped = useMemo(() => {
    const sections = new Map<string, OpenProgramBacklogItem[]>();
    for (const item of visible) {
      const key = item.section?.trim() || "Program";
      const list = sections.get(key) ?? [];
      list.push(item);
      sections.set(key, list);
    }
    return [...sections.entries()];
  }, [visible]);

  const bound = initial.programs.length > 0;
  const fetchErrors = initial.programs.filter((p) => p.fetchError);

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Open Program · {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Backlog</h1>
          <nav className={styles.headLinks} aria-label="Related">
            <Link
              href={`/workspaces/${workspaceId}/projects`}
              className={styles.headLink}
            >
              Projects
            </Link>
            <span className={styles.headSep} aria-hidden>
              ·
            </span>
            <Link
              href={`/workspaces/${workspaceId}/arena`}
              className={styles.headLink}
            >
              Arena
            </Link>
            <span className={styles.headSep} aria-hidden>
              ·
            </span>
            <Link
              href={`/workspaces/${workspaceId}/activity`}
              className={styles.headLink}
            >
              Activity
            </Link>
          </nav>
        </div>
        <p className={styles.lede}>
          Open Program lines bound to this workspace — status from the program
          file, overlaid with work already in flight.
        </p>
        {bound ? (
          <div className={styles.summaryStrip} aria-label="Backlog summary">
            <span className={styles.summaryItem}>
              <strong>{counts.open}</strong> open
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span className={styles.summaryItem}>
              <strong>{counts.in_flight}</strong> in flight
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span className={styles.summaryItem}>
              <strong>{counts.done}</strong> done
            </span>
            {initial.programs.length > 0 ? (
              <>
                <span className={styles.summaryDot} aria-hidden>
                  ·
                </span>
                <span className={styles.summaryItem}>
                  <strong>{initial.programs.length}</strong> program
                  {initial.programs.length === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {!bound ? (
        <div className={styles.body}>
          <EmptyState
            title="No Open Program bound"
            body={
              initial.unboundProjectCount > 0
                ? "Bind architectureRepo and architecturePaths on a project’s Configuration (Open Program bind) to load spendable backlog rows."
                : "Create a project and bind an Open Program path to see backlog items here."
            }
            action={
              <span className={styles.linkCtaRow}>
                <Link
                  href={`/workspaces/${workspaceId}/projects`}
                  className={styles.linkCta}
                >
                  Open Projects →
                </Link>
                <Link href="/docs/open-program-runtime" className={styles.linkCta}>
                  Open Program docs →
                </Link>
              </span>
            }
          />
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.filters} role="tablist" aria-label="Status">
              {(
                [
                  ["all", "All", counts.all],
                  ["open", "Open", counts.open],
                  ["in_flight", "In flight", counts.in_flight],
                  ["done", "Done", counts.done],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === id}
                  className={
                    statusFilter === id
                      ? `${styles.filter} ${styles.filterActive}`
                      : styles.filter
                  }
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                  <span className={styles.filterCount}>{n}</span>
                </button>
              ))}
            </div>
            {projectOptions.length > 1 ? (
              <label className={styles.projectFilter}>
                <span className={styles.projectFilterLabel}>Project</span>
                <select
                  className={styles.projectSelect}
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                >
                  <option value="all">All projects</option>
                  {projectOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {fetchErrors.length > 0 ? (
            <p className={styles.fetchTip} role="status">
              Could not refresh{" "}
              {fetchErrors.map((p) => p.architectureRepo).join(", ")}. Re-check
              the Open Program bind and GitHub token — no invented rows.
            </p>
          ) : null}

          <div className={styles.body}>
            {visible.length === 0 ? (
              <EmptyState
                title={
                  counts.all === 0
                    ? "Open Program rows unavailable"
                    : "Nothing in this filter"
                }
                body={
                  counts.all === 0
                    ? fetchErrors.length > 0
                      ? "GitHub could not return the bound markdown. Confirm the App can read those repos, or that the paths are public."
                      : "The bound files have no Open/Done program IDs yet."
                    : "Try All, or another project chip."
                }
              />
            ) : (
              grouped.map(([section, rows]) => (
                <section
                  key={section}
                  className={styles.section}
                  aria-labelledby={`sec-${section}`}
                >
                  <h2 id={`sec-${section}`} className={styles.sectionTitle}>
                    {section}
                  </h2>
                  <ul className={styles.list}>
                    {rows.map((item) => {
                      const href = taskHref(workspaceId, item);
                      const cta = taskCta(item);
                      return (
                        <li
                          key={`${item.architectureRepo}:${item.id}:${item.projectId}`}
                          className={styles.row}
                        >
                          <div className={styles.rowTop}>
                            <span className={styles.openId}>{item.id}</span>
                            <span
                              className={`${styles.badge} ${statusClass(item.status)}`}
                            >
                              {statusLabel(item.status)}
                            </span>
                            <span className={styles.projectTag}>
                              {item.projectName}
                            </span>
                          </div>
                          <p className={styles.rowTitle}>{item.title}</p>
                          {item.notes ? (
                            <p className={styles.rowNotes}>{item.notes}</p>
                          ) : null}
                          {item.fetchError ? (
                            <p className={styles.rowError}>{item.fetchError}</p>
                          ) : null}
                          <div className={styles.rowMeta}>
                            <span className={styles.metaMuted}>
                              {item.architectureRepo}
                              <span aria-hidden> · </span>
                              {item.architecturePaths}
                            </span>
                            {item.taskStatus ? (
                              <span className={styles.metaTask}>
                                Task {item.taskStatus.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {href && cta ? (
                              <Link href={href} className={styles.rowLink}>
                                {cta} →
                              </Link>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
