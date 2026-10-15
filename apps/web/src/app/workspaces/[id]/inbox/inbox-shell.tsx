"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SerializedApproval } from "@/lib/approval";
import styles from "./inbox.module.css";

export type InboxTab = "pending" | "brief" | "task" | "recent";

type Props = {
  workspaceId: string;
  workspaceName: string;
  canManage: boolean;
  pending: SerializedApproval[];
  recent: SerializedApproval[];
  initialTab: InboxTab;
  initialSelectedId: string | null;
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function typeLabel(type: string): string {
  switch (type) {
    case "brief":
      return "Brief";
    case "task":
      return "Task";
    case "run_review":
      return "Review";
    case "merge":
      return "Merge";
    case "milestone":
      return "Milestone";
    default:
      return type;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "changes_requested":
      return "Changes";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function InboxShell({
  workspaceId,
  workspaceName,
  canManage,
  pending,
  recent,
  initialTab,
  initialSelectedId,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [, startTransition] = useTransition();

  const rows = useMemo(() => {
    if (tab === "recent") return recent;
    if (tab === "brief") return pending.filter((a) => a.targetType === "brief");
    if (tab === "task") return pending.filter((a) => a.targetType === "task");
    return pending;
  }, [tab, pending, recent]);

  const selected = useMemo(() => {
    if (selectedId) {
      const hit =
        rows.find((a) => a.id === selectedId) ??
        pending.find((a) => a.id === selectedId) ??
        recent.find((a) => a.id === selectedId);
      if (hit) return hit;
    }
    return rows[0] ?? null;
  }, [selectedId, rows, pending, recent]);

  const syncUrl = useCallback(
    (nextTab: InboxTab, nextId: string | null) => {
      const params = new URLSearchParams();
      if (nextTab !== "pending") params.set("tab", nextTab);
      if (nextId) params.set("a", nextId);
      const qs = params.toString();
      router.replace(
        `/workspaces/${workspaceId}/inbox${qs ? `?${qs}` : ""}`,
        { scroll: false },
      );
    },
    [router, workspaceId],
  );

  function selectTab(next: InboxTab) {
    setTab(next);
    setError(null);
    setNote("");
    const list =
      next === "recent"
        ? recent
        : next === "brief"
          ? pending.filter((a) => a.targetType === "brief")
          : next === "task"
            ? pending.filter((a) => a.targetType === "task")
            : pending;
    const nextId = list[0]?.id ?? null;
    setSelectedId(nextId);
    syncUrl(next, nextId);
  }

  function selectRow(id: string) {
    setSelectedId(id);
    setError(null);
    setNote("");
    syncUrl(tab, id);
  }

  async function approveSelected() {
    if (!selected || selected.status !== "pending" || !canManage) return;
    setPendingAction(true);
    setError(null);
    try {
      let res: Response;
      if (selected.targetType === "brief") {
        res = await fetch(
          `/api/projects/${selected.projectId}/brief/${selected.targetId}/approve`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId }),
          },
        );
      } else if (selected.targetType === "task") {
        res = await fetch(`/api/tasks/${selected.targetId}/approve`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
      } else {
        throw new Error(
          `Approve from inbox is not supported for ${selected.targetType}`,
        );
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `Approve failed (${res.status})`);
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setPendingAction(false);
    }
  }

  async function resolveSelected(
    decision: "rejected" | "changes_requested",
  ) {
    if (!selected || selected.status !== "pending" || !canManage) return;
    setPendingAction(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/approvals/${selected.id}/resolve`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            note: note.trim() || undefined,
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `Resolve failed (${res.status})`);
      }
      setNote("");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setPendingAction(false);
    }
  }

  const counts = {
    pending: pending.length,
    brief: pending.filter((a) => a.targetType === "brief").length,
    task: pending.filter((a) => a.targetType === "task").length,
    recent: recent.length,
  };

  const emptyCopy =
    tab === "recent"
      ? {
          title: "No recent decisions",
          body: "Approved, rejected, and expired gates from the last two weeks show up here.",
        }
      : tab === "brief"
        ? {
            title: "No briefs waiting",
            body: "Draft briefs that need approval will land in this filter.",
          }
        : tab === "task"
          ? {
              title: "No tasks waiting",
              body: "Tasks ready for queue approval appear here.",
            }
          : {
              title: "No gates waiting",
              body: "Human gates for briefs and tasks land here when work needs your decision.",
            };

  return (
    <main className={styles.main}>
      <header className={styles.pageBar}>
        <div className={styles.pageBarLeft}>
          <h1 className={styles.title}>Inbox</h1>
          <div className={styles.chips}>
            <span className={styles.chip}>{workspaceName}</span>
            <span className={styles.chip}>
              {counts.pending} pending
            </span>
          </div>
        </div>
        <Link
          href={`/workspaces/${workspaceId}/projects`}
          className={styles.toolbarGhost}
        >
          Projects
        </Link>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Inbox filters">
        {(
          [
            ["pending", "Pending", counts.pending],
            ["brief", "Briefs", counts.brief],
            ["task", "Tasks", counts.task],
            ["recent", "Recent", counts.recent],
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
            <span className={styles.tabCount}>{count}</span>
          </button>
        ))}
      </div>

      <div className={styles.split}>
        <section className={styles.listPane} aria-label="Approvals list">
          {rows.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{emptyCopy.title}</p>
              <p className={styles.emptyBody}>
                {emptyCopy.body}{" "}
                <Link
                  href={`/workspaces/${workspaceId}/projects`}
                  className={styles.emptyLink}
                >
                  Open projects
                </Link>
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {rows.map((a) => {
                const active = selected?.id === a.id;
                const title =
                  a.title?.trim() ||
                  a.riskSummary?.trim() ||
                  `${typeLabel(a.targetType)} ${shortId(a.targetId)}`;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? `${styles.rowBtn} ${styles.rowBtnActive}`
                          : styles.rowBtn
                      }
                      onClick={() => selectRow(a.id)}
                    >
                      <span
                        className={`${styles.statusRing} ${
                          a.status === "pending"
                            ? styles.statusPending
                            : a.status === "approved"
                              ? styles.statusApproved
                              : styles.statusSettled
                        }`}
                        aria-hidden
                      />
                      <span className={styles.rowBody}>
                        <span className={styles.rowTop}>
                          <span className={styles.rowType}>
                            {typeLabel(a.targetType)}
                          </span>
                          <span className={styles.rowTime}>
                            {formatRelative(
                              a.status === "pending"
                                ? a.createdAt
                                : (a.decidedAt ?? a.updatedAt),
                            )}
                          </span>
                        </span>
                        <span className={styles.rowTitle}>{title}</span>
                        <span className={styles.rowMeta}>
                          {a.projectName ?? "Project"}
                          {a.riskSummary && a.title !== a.riskSummary
                            ? ` · ${a.riskSummary}`
                            : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.detailPane} aria-label="Approval detail">
          {!selected ? (
            <div className={styles.detailEmpty}>
              <p className={styles.emptyTitle}>Select an item</p>
              <p className={styles.emptyBody}>
                Choose a gate from the list to review risk and decide.
              </p>
            </div>
          ) : (
            <div className={styles.detail}>
              <div className={styles.detailHead}>
                <span
                  className={`${styles.detailPill} ${
                    selected.status === "pending"
                      ? styles.detailPillPending
                      : selected.status === "approved"
                        ? styles.detailPillApproved
                        : styles.detailPillSettled
                  }`}
                >
                  {statusLabel(selected.status)}
                </span>
                <span className={styles.detailType}>
                  {typeLabel(selected.targetType)}
                </span>
              </div>
              <h2 className={styles.detailTitle}>
                {selected.title?.trim() ||
                  selected.riskSummary?.trim() ||
                  `${typeLabel(selected.targetType)} ${shortId(selected.targetId)}`}
              </h2>
              <dl className={styles.detailMeta}>
                <div>
                  <dt>Project</dt>
                  <dd>
                    <Link
                      href={`/workspaces/${workspaceId}/projects/${selected.projectId}`}
                      className={styles.detailLink}
                    >
                      {selected.projectName ?? shortId(selected.projectId)}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>
                    {formatRelative(selected.createdAt)} ·{" "}
                    {shortId(selected.requestedBy)}
                  </dd>
                </div>
                {selected.decidedAt ? (
                  <div>
                    <dt>Decided</dt>
                    <dd>
                      {formatRelative(selected.decidedAt)}
                      {selected.decidedBy
                        ? ` · ${shortId(selected.decidedBy)}`
                        : null}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {selected.riskSummary ? (
                <div className={styles.detailBlock}>
                  <p className={styles.detailBlockLabel}>Risk summary</p>
                  <p className={styles.detailBlockBody}>
                    {selected.riskSummary}
                  </p>
                </div>
              ) : null}

              {selected.decisionNote ? (
                <div className={styles.detailBlock}>
                  <p className={styles.detailBlockLabel}>Decision note</p>
                  <p className={styles.detailBlockBody}>
                    {selected.decisionNote}
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className={styles.detailError} role="alert">
                  {error}
                </p>
              ) : null}

              <div className={styles.detailActions}>
                {selected.status === "pending" && canManage ? (
                  <>
                    {(selected.targetType === "brief" ||
                      selected.targetType === "task") && (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={pendingAction}
                        onClick={() => void approveSelected()}
                      >
                        {pendingAction ? "Working…" : "Approve"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={pendingAction}
                      onClick={() => void resolveSelected("rejected")}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      disabled={pendingAction}
                      onClick={() =>
                        void resolveSelected("changes_requested")
                      }
                    >
                      Request changes
                    </button>
                  </>
                ) : null}
                <Link href={selected.href} className={styles.btnGhost}>
                  Open in project
                </Link>
              </div>

              {selected.status === "pending" && canManage ? (
                <label className={styles.noteField}>
                  <span className={styles.noteLabel}>
                    Note (optional, for reject / changes)
                  </span>
                  <textarea
                    className={styles.noteInput}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why this decision?"
                    maxLength={2000}
                  />
                </label>
              ) : null}

              {!canManage && selected.status === "pending" ? (
                <p className={styles.detailHint}>
                  Only workspace owners can approve or reject. You can still
                  open the project to review context.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
