"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
        Not just the PR — CI, validation, diff, findings, fitness, and policy.
        Hard gates must clear before Accept; soft gates inform the decision.
      </p>
      {error ? <p className={styles.stackWarn}>{error}</p> : null}

      {deliveries.length === 0 ? (
        <p className={styles.sectionLede}>
          No deliveries yet. Import an issue from Overview, run Arena, then
          return here when a PR is ready.{" "}
          <Link href={`${base}?tab=overview`}>Start from issue</Link>
        </p>
      ) : (
        <ul className={styles.evidenceList}>
          {deliveries.map((d) => {
            const gates = gatesByTask[d.taskId] ?? [];
            const open = expandedId === d.taskId;
            return (
              <li key={d.taskId} className={styles.evidenceRow}>
                <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
                  <button
                    type="button"
                    className={styles.evidenceTitle}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onClick={() => void expand(d.taskId)}
                  >
                    {d.title}
                  </button>
                  <p className={styles.evidenceMeta}>
                    {statusHint(d.status, d.acceptReady)}
                    {d.prUrl ? " · PR attached" : ""}
                    {d.updatedAt ? ` · ${formatWhen(d.updatedAt)}` : ""}
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
                  ) : null}
                </div>
                <div className={styles.evidenceActions}>
                  <Link
                    href={`${base}/tasks/${d.taskId}`}
                    className={styles.ghostBtn}
                  >
                    Delivery Review
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
