"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/ui";
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
  /** REVIEW_REQUIRED deliveries — Accept lives on Evidence, not Inbox. */
  evidenceCount?: number;
  evidenceHref?: string | null;
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

/** Prefer human labels over truncated machine actor ids (script:d…). */
function actorLabel(id: string | null | undefined): string {
  if (!id) return "—";
  const raw = id.trim();
  if (!raw) return "—";
  if (raw === "system" || raw.startsWith("system:")) return "system";
  if (raw.startsWith("script:")) return "script";
  if (raw.startsWith("user:")) return shortId(raw.slice(5));
  if (raw.startsWith("agent:")) return shortId(raw.slice(6));
  return shortId(raw);
}

function displayTitle(a: SerializedApproval): string {
  return (
    a.title?.trim() ||
    a.riskSummary?.trim() ||
    `${typeLabel(a.targetType)} ${shortId(a.targetId)}`
  );
}

function usefulRiskSummary(a: SerializedApproval): string | null {
  const risk = a.riskSummary?.trim();
  if (!risk) return null;
  const title = a.title?.trim();
  if (!title) return risk;
  if (risk === title) return null;
  // "Brief r1: {title}" style echoes — skip when the title already carries it.
  const stripped = risk.replace(/^(brief|task|review|merge)\s+r?\d*\s*:\s*/i, "");
  if (stripped === title || risk.endsWith(title)) return null;
  return risk;
}

export function InboxShell({
  workspaceId,
  workspaceName,
  canManage,
  pending,
  recent,
  initialTab,
  initialSelectedId,
  evidenceCount = 0,
  evidenceHref = null,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [optimisticGone, setOptimisticGone] = useState<Set<string>>(
    () => new Set(),
  );
  const [, startTransition] = useTransition();

  const livePending = useMemo(
    () => pending.filter((a) => !optimisticGone.has(a.id)),
    [pending, optimisticGone],
  );

  const rows = useMemo(() => {
    if (tab === "recent") return recent;
    if (tab === "brief")
      return livePending.filter((a) => a.targetType === "brief");
    if (tab === "task")
      return livePending.filter((a) => a.targetType === "task");
    return livePending;
  }, [tab, livePending, recent]);

  const selected = useMemo(() => {
    if (selectedId) {
      const hit =
        rows.find((a) => a.id === selectedId) ??
        livePending.find((a) => a.id === selectedId) ??
        recent.find((a) => a.id === selectedId);
      if (hit) return hit;
    }
    return rows[0] ?? null;
  }, [selectedId, rows, livePending, recent]);

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
          ? livePending.filter((a) => a.targetType === "brief")
          : next === "task"
            ? livePending.filter((a) => a.targetType === "task")
            : livePending;
    const nextId = list[0]?.id ?? null;
    setSelectedId(nextId);
    syncUrl(next, nextId);
  }

  function markGone(id: string) {
    setOptimisticGone((prev) => new Set(prev).add(id));
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
      const goneId = selected.id;
      markGone(goneId);
      toast.push("Approved", "success");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
      toast.push(
        err instanceof Error ? err.message : "Approve failed",
        "error",
      );
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
      markGone(selected.id);
      setNote("");
      toast.push(
        decision === "rejected" ? "Rejected" : "Changes requested",
        "success",
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
      toast.push(
        err instanceof Error ? err.message : "Resolve failed",
        "error",
      );
    } finally {
      setPendingAction(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (pendingAction) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = rows.findIndex((r) => r.id === selected?.id);
        const next = rows[Math.min(rows.length - 1, Math.max(0, idx) + 1)];
        if (next) selectRow(next.id);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = rows.findIndex((r) => r.id === selected?.id);
        const next = rows[Math.max(0, (idx < 0 ? 0 : idx) - 1)];
        if (next) selectRow(next.id);
        return;
      }
      if (e.key === "Enter" && selected?.href) {
        e.preventDefault();
        router.push(selected.href);
        return;
      }
      if (e.key === "a" && canManage) {
        e.preventDefault();
        void approveSelected();
        return;
      }
      if (e.key === "r" && canManage) {
        e.preventDefault();
        void resolveSelected("rejected");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const counts = {
    pending: livePending.length,
    brief: livePending.filter((a) => a.targetType === "brief").length,
    task: livePending.filter((a) => a.targetType === "task").length,
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
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Inbox</h1>
          <div className={styles.headActions}>
            <span className={styles.kbdHint}>
              {canManage ? "j/k · a approve · r reject · ↵" : "j/k · ↵ open"}
            </span>
            <nav className={styles.headLinks} aria-label="Related">
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
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link
                href={`/workspaces/${workspaceId}/projects`}
                className={styles.headLink}
              >
                Projects
              </Link>
            </nav>
          </div>
        </div>
        <p className={styles.lede}>
          Human gates for briefs and tasks. Pending needs a decision; Recent
          keeps the last two weeks of settled calls.
        </p>
        <div className={styles.summaryStrip} aria-label="Inbox summary">
          <span className={styles.summaryItem}>
            <strong>{counts.pending}</strong> pending
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{counts.brief}</strong> briefs
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{counts.task}</strong> tasks
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{counts.recent}</strong> recent
          </span>
          {evidenceCount > 0 ? (
            <>
              <span className={styles.summaryDot} aria-hidden>
                ·
              </span>
              <span className={styles.summaryItem}>
                <strong>{evidenceCount}</strong> on Evidence
              </span>
            </>
          ) : null}
        </div>
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

      {rows.length === 0 ? (
        <section className={styles.emptyFull} aria-label="Empty inbox">
          <p className={styles.emptyTitle}>{emptyCopy.title}</p>
          <p className={styles.emptyBody}>{emptyCopy.body}</p>
          {counts.pending === 0 && tab !== "recent" ? (
            <p className={styles.emptyHint}>
              {evidenceCount > 0
                ? `${evidenceCount} deliver${evidenceCount === 1 ? "y" : "ies"} waiting on Evidence Accept — Inbox is only for brief/task gates.`
                : "Nothing pending usually means autonomous work is running or gates are quiet — check Arena or Activity."}
            </p>
          ) : null}
          <div className={styles.emptyActions}>
            {evidenceCount > 0 && evidenceHref ? (
              <Link href={evidenceHref} className={styles.emptyCta}>
                Open Evidence → Accept
              </Link>
            ) : (
              <Link
                href={`/workspaces/${workspaceId}/projects`}
                className={styles.emptyCta}
              >
                Browse projects
              </Link>
            )}
            <Link
              href={`/workspaces/${workspaceId}/arena`}
              className={styles.emptyLink}
            >
              Open Arena
            </Link>
          </div>
        </section>
      ) : (
      <div className={styles.split}>
        <section className={styles.listPane} aria-label="Approvals list">
            <ul className={styles.list}>
              {rows.map((a) => {
                const active = selected?.id === a.id;
                const title = displayTitle(a);
                const risk = usefulRiskSummary(a);
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
                            {a.status !== "pending"
                              ? ` · ${statusLabel(a.status)}`
                              : ""}
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
                          {risk ? ` · ${risk}` : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
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
              <h2 className={styles.detailTitle}>{displayTitle(selected)}</h2>
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
                    {actorLabel(selected.requestedBy)}
                  </dd>
                </div>
                {selected.decidedAt ? (
                  <div>
                    <dt>Decided</dt>
                    <dd>
                      {formatRelative(selected.decidedAt)}
                      {selected.decidedBy
                        ? ` · ${actorLabel(selected.decidedBy)}`
                        : null}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {(() => {
                const risk = usefulRiskSummary(selected);
                if (!risk) return null;
                return (
                  <div className={styles.detailBlock}>
                    <p className={styles.detailBlockLabel}>Risk summary</p>
                    <p className={styles.detailBlockBody}>{risk}</p>
                  </div>
                );
              })()}

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
      )}
    </main>
  );
}
