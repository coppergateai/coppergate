"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { displayTaskTitle } from "@/lib/display-title";
import { EmptyState } from "@/components/app/ui";
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

  return (
    <section className={styles.section} aria-labelledby="evidence-heading">
      <div className={styles.sectionHead}>
        <h2 id="evidence-heading" className={styles.sectionLabel}>
          Evidence Center
        </h2>
      </div>
      <p className={styles.sectionLede}>
        CI, validation, diff, findings, and policy — hard gates must clear
        before Accept.
      </p>
      {error ? <p className={styles.stackWarn}>{error}</p> : null}

      {deliveries.length === 0 ? (
        <EmptyState
          title="No deliveries yet"
          body="Start in Arena. When a PR is ready, evidence and gates land here for Accept."
          action={
            <Link href={`${base}?tab=arena`} className={styles.linkCta}>
              Open Arena → Start
            </Link>
          }
        />
      ) : (
        <ul className={styles.evidenceList}>
          {deliveries.map((d) => {
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
                    {!open ? " · Gates" : ""}
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
                  <Link
                    href={`${base}/tasks/${d.taskId}`}
                    className={styles.ghostBtn}
                  >
                    Review
                  </Link>
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
      )}
    </section>
  );
}
