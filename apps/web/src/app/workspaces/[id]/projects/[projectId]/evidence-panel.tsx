"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { displayTaskTitle } from "@/lib/display-title";
import { EmptyState, OpenIdBadge } from "@/components/app/ui";
import { gateStatusLabel, type GateStatus } from "@/lib/hard-gates";
import styles from "./project-detail.module.css";

type DeliveryRow = {
  taskId: string;
  title: string;
  status: string;
  prUrl: string | null;
  updatedAt: string;
  runId: string | null;
  acceptReady: boolean | null;
};

type Gate = {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
  hard: boolean;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialDeliveries?: DeliveryRow[];
};

function statusHint(status: string, acceptReady: boolean | null): string {
  if (status === "REVIEW_REQUIRED") {
    return acceptReady
      ? "Ready for Accept — gates clear"
      : "Review required — check hard gates";
  }
  if (status === "ACCEPTED" || status === "DONE") return "Verified delivery";
  if (status === "WAITING_CI") return "Awaiting CI evidence";
  if (status === "FAILED") return "Failed — Retry or re-scope";
  return status;
}

function statusTone(
  status: string,
  acceptReady: boolean | null,
): "ok" | "warn" | "fail" | "mute" {
  if (status === "ACCEPTED" || status === "DONE") return "ok";
  if (status === "FAILED") return "fail";
  if (status === "REVIEW_REQUIRED") return acceptReady ? "ok" : "warn";
  if (status === "WAITING_CI" || status === "VALIDATING") return "warn";
  return "mute";
}

function statusPillLabel(status: string, acceptReady: boolean | null): string {
  if (status === "ACCEPTED" || status === "DONE") return "Verified";
  if (status === "FAILED") return "Failed";
  if (status === "REVIEW_REQUIRED") {
    return acceptReady ? "Accept ready" : "Needs review";
  }
  if (status === "WAITING_CI") return "CI";
  if (status === "VALIDATING") return "Validating";
  return status;
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Lower = higher in Evidence Center (actionable first). */
function evidenceRank(d: DeliveryRow): number {
  if (d.status === "REVIEW_REQUIRED" && d.acceptReady) return 0;
  if (d.status === "FAILED") return 1;
  if (d.status === "REVIEW_REQUIRED") return 2;
  if (d.status === "WAITING_CI" || d.status === "VALIDATING") return 3;
  if (d.status === "ACCEPTED" || d.status === "DONE") return 5;
  return 4;
}

function sortDeliveries(rows: DeliveryRow[]): DeliveryRow[] {
  return [...rows].sort((a, b) => {
    const rank = evidenceRank(a) - evidenceRank(b);
    if (rank !== 0) return rank;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

/**
 * Evidence Center — why a delivery is acceptable (gates + deep-link to review).
 */
export function EvidencePanel({
  workspaceId,
  projectId,
  initialDeliveries = [],
}: Props) {
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const [deliveries, setDeliveries] =
    useState<DeliveryRow[]>(initialDeliveries);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gatesByTask, setGatesByTask] = useState<Record<string, Gate[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const ordered = useMemo(() => sortDeliveries(deliveries), [deliveries]);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/evidence?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    );
    const body = (await res.json()) as {
      deliveries?: DeliveryRow[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? "Failed to load evidence");
    }
    setDeliveries(body.deliveries ?? []);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [load]);

  async function expand(taskId: string) {
    if (expandedId === taskId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(taskId);
    if (gatesByTask[taskId]) return;
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/evidence?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "same-origin" },
      );
      const body = (await res.json()) as {
        evidence?: { selected?: { gates?: Gate[] } };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? "Failed to load gates");
      }
      setGatesByTask((prev) => ({
        ...prev,
        [taskId]: body.evidence?.selected?.gates ?? [],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function retryFailed(taskId: string): Promise<void> {
    setRetryingId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(body.error?.message ?? "Retry failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  }

  async function acceptDelivery(taskId: string): Promise<void> {
    setAcceptingId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, decision: "accept" }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(body.error?.message ?? "Accept failed");
      }
      window.location.assign(`${base}/tasks/${taskId}/receipt`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAcceptingId(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="evidence-heading">
      <div className={styles.sectionHead}>
        <h2 id="evidence-heading" className={styles.sectionLabel}>
          Evidence Center
        </h2>
      </div>
      <p className={styles.sectionLede}>
        CI, validation, diff, and policy must clear before Accept. Accept
        writes a Ship Receipt against the Open Program ID.
      </p>
      {error ? <p className={styles.stackWarn}>{error}</p> : null}

      {ordered.length === 0 ? (
        <EmptyState
          title="No Open ID deliveries yet"
          body="No Open ID, no spend. Bind an Open Program line, queue against that ID, then Accept here for a Ship Receipt — freestyle Arena invent is refused when the program is bound."
          action={
            <Link href={`/docs/open-program-runtime`} className={styles.linkCta}>
              Open Program Runtime →
            </Link>
          }
        />
      ) : (
        <>
        <p className={styles.evidenceSummary} aria-label="Evidence summary">
          <span>
            <strong>
              {
                ordered.filter(
                  (d) => d.status === "REVIEW_REQUIRED" && d.acceptReady,
                ).length
              }
            </strong>{" "}
            accept ready
          </span>
          <span>
            <strong>
              {
                ordered.filter((d) => d.status === "FAILED").length
              }
            </strong>{" "}
            failed
          </span>
          <span>
            <strong>
              {
                ordered.filter(
                  (d) => d.status === "ACCEPTED" || d.status === "DONE",
                ).length
              }
            </strong>{" "}
            verified
          </span>
        </p>
        <ul className={styles.evidenceList}>
          {ordered.map((d) => {
            const gates = gatesByTask[d.taskId] ?? [];
            const open = expandedId === d.taskId;
            const tone = statusTone(d.status, d.acceptReady);
            const title = displayTaskTitle(d.title) || d.title;
            return (
              <li key={d.taskId} className={styles.evidenceRow}>
                <div className={styles.evidenceMain}>
                  <div className={styles.evidenceHead}>
                    <span
                      className={`${styles.evidencePill} ${
                        tone === "ok"
                          ? styles.evidencePillOk
                          : tone === "fail"
                            ? styles.evidencePillFail
                            : tone === "warn"
                              ? styles.evidencePillWarn
                              : styles.evidencePillMute
                      }`}
                    >
                      {statusPillLabel(d.status, d.acceptReady)}
                    </span>
                    <OpenIdBadge title={d.title} />
                    <button
                      type="button"
                      className={styles.evidenceTitle}
                      onClick={() => void expand(d.taskId)}
                      aria-expanded={open}
                    >
                      {title}
                    </button>
                  </div>
                  <p className={styles.evidenceMeta}>
                    {statusHint(d.status, d.acceptReady)}
                    {d.prUrl ? " · PR attached" : ""}
                    {d.updatedAt ? ` · ${formatWhen(d.updatedAt)}` : ""}
                    {!open ? " · Expand gates" : ""}
                  </p>
                  {open && gates.length > 0 ? (
                    <ul className={styles.gateList}>
                      {gates.map((g) => (
                        <li key={g.id} className={styles.gateItem}>
                          <span
                            className={
                              g.status === "passed"
                                ? styles.gatePass
                                : g.status === "failed"
                                  ? styles.gateFail
                                  : styles.gatePending
                            }
                          >
                            {gateStatusLabel(g.status)}
                          </span>
                          <span>
                            {g.label}
                            {g.hard ? " · hard" : ""}
                          </span>
                          <span className={styles.evidenceMeta}>{g.detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : open ? (
                    <p className={styles.evidenceMeta}>No gate details yet.</p>
                  ) : null}
                </div>
                <div className={styles.evidenceActions}>
                  {d.status === "REVIEW_REQUIRED" && d.acceptReady ? (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={acceptingId === d.taskId}
                      onClick={() => void acceptDelivery(d.taskId)}
                    >
                      {acceptingId === d.taskId ? "Accepting…" : "Accept"}
                    </button>
                  ) : null}
                  {d.status === "FAILED" ? (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={retryingId === d.taskId}
                      onClick={() => void retryFailed(d.taskId)}
                    >
                      {retryingId === d.taskId ? "Retrying…" : "Retry"}
                    </button>
                  ) : null}
                  <Link
                    href={`${base}/tasks/${d.taskId}`}
                    className={styles.ghostBtn}
                  >
                    {d.status === "REVIEW_REQUIRED" && d.acceptReady
                      ? "Details"
                      : d.status === "REVIEW_REQUIRED"
                        ? "Review gates"
                        : d.status === "FAILED"
                          ? "Details"
                          : "Review"}
                  </Link>
                  {d.status === "ACCEPTED" || d.status === "DONE" ? (
                    <Link
                      href={`${base}/tasks/${d.taskId}/receipt`}
                      className={styles.ghostBtn}
                    >
                      Ship Receipt
                    </Link>
                  ) : null}
                  {d.prUrl ? (
                    <a
                      href={d.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.ghostBtn}
                    >
                      Open PR
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </section>
  );
}
