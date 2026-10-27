"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { displayTaskTitle } from "@/lib/display-title";
import styles from "./arena-mission.module.css";

export type InspectorRun = {
  id: string;
  status: string;
  taskId: string;
  taskTitle: string;
  actualCostMicros: number;
  prUrl: string | null;
  prNumber: number | null;
  errorCode: string | null;
  updatedAt: string;
};

export type InspectorContender = {
  id: string;
  profileKey: string;
  strategy: string;
  temperament: string | null;
  budgetMicrosRemaining: number;
  latestRun: InspectorRun | null;
};

type Tab = "overview" | "logs" | "artifacts";

type RunEvent = {
  id: string;
  seq: number;
  kind: string;
  payload: unknown;
  createdAt: string;
};

type ArtifactRow = {
  id: string;
  kind: string;
  contentType: string;
  storageKey: string;
  checksumSha256: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  repoFullName: string;
  contender: InspectorContender;
  statusLabel: string;
  statusBadgeClass: string;
  onClose: () => void;
};

const ACTIVE_RUN = new Set(["QUEUED", "RUNNING", "VALIDATING", "WAITING_CI"]);
const MAX_EVENTS = 100;
const PREVIEW_CHARS = 2000;

function titleCase(key: string): string {
  if (!key) return "Agent";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function temperLabel(temperament: string | null): string {
  if (!temperament) return "Balanced";
  return temperament.charAt(0).toUpperCase() + temperament.slice(1);
}

function formatUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(dollars < 1 ? 3 : 2)}`;
}

function eventMessage(event: RunEvent): string {
  const payload = event.payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (obj.code === "coding_path_honesty") {
      const demoted = obj.demoted;
      if (
        demoted &&
        typeof demoted === "object" &&
        (demoted as { harness?: string }).harness === "native_openai" &&
        typeof (demoted as { reason?: string }).reason === "string"
      ) {
        return `Cursor harness · native_openai demoted — ${(demoted as { reason: string }).reason}`;
      }
    }
    if (obj.code === "provider_failover") {
      const reason =
        typeof obj.reason === "string" ? obj.reason.trim() : "";
      const trigger =
        typeof obj.trigger === "string" ? obj.trigger.trim() : "";
      if (reason && trigger) {
        return `Failover (${trigger.replace(/_/g, " ")}): ${reason}`;
      }
      if (reason) return `Provider failover: ${reason}`;
    }
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.summary === "string") return obj.summary;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.status === "string") return obj.status;
    try {
      return JSON.stringify(obj);
    } catch {
      /* fall through */
    }
  }
  return event.kind;
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

function artifactSummary(meta: Record<string, unknown>): string {
  if (typeof meta.summary === "string" && meta.summary.trim()) {
    return meta.summary;
  }
  if (typeof meta.passed === "boolean") {
    return meta.passed ? "Passed" : "Failed";
  }
  if (typeof meta.inlineBody === "string") {
    try {
      const parsed = JSON.parse(meta.inlineBody) as Record<string, unknown>;
      if (typeof parsed.summary === "string") return parsed.summary;
      if (typeof parsed.passed === "boolean") {
        return parsed.passed ? "Passed" : "Failed";
      }
    } catch {
      /* plain text body */
    }
  }
  return meta.validator ? String(meta.validator) : "Artifact";
}

function artifactPreview(meta: Record<string, unknown>): string {
  const raw =
    typeof meta.inlineBody === "string"
      ? meta.inlineBody
      : JSON.stringify(meta, null, 2);
  if (raw.length <= PREVIEW_CHARS) return raw;
  return `${raw.slice(0, PREVIEW_CHARS)}\n…`;
}

export function AgentInspector({
  workspaceId,
  projectId,
  repoFullName,
  contender,
  statusLabel,
  statusBadgeClass,
  onClose,
}: Props) {
  const run = contender.latestRun;
  const [tab, setTab] = useState<Tab>("overview");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);

  const runId = run?.id ?? null;
  const runStatus = run?.status ?? null;
  const pollLive = Boolean(runStatus && ACTIVE_RUN.has(runStatus));

  const loadEvents = useCallback(async () => {
    if (!runId) {
      setEvents([]);
      setEventsError(null);
      return;
    }
    setEventsLoading(true);
    setEventsError(null);
    try {
      const res = await fetch(
        `/api/runs/${runId}/events?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "same-origin" },
      );
      const data = (await res.json()) as {
        events?: RunEvent[];
        error?: { message?: string };
      };
      if (!res.ok) {
        setEventsError(data.error?.message ?? "Failed to load events");
        return;
      }
      const list = [...(data.events ?? [])]
        .sort((a, b) => a.seq - b.seq)
        .slice(-MAX_EVENTS);
      setEvents(list);
    } catch {
      setEventsError("Failed to load events");
    } finally {
      setEventsLoading(false);
    }
  }, [runId, workspaceId]);

  const loadArtifacts = useCallback(async () => {
    if (!runId) {
      setArtifacts([]);
      setArtifactsError(null);
      return;
    }
    setArtifactsLoading(true);
    setArtifactsError(null);
    try {
      const res = await fetch(
        `/api/runs/${runId}/artifacts?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "same-origin" },
      );
      const data = (await res.json()) as {
        artifacts?: ArtifactRow[];
        error?: { message?: string };
      };
      if (!res.ok) {
        setArtifactsError(data.error?.message ?? "Failed to load artifacts");
        return;
      }
      setArtifacts(data.artifacts ?? []);
    } catch {
      setArtifactsError("Failed to load artifacts");
    } finally {
      setArtifactsLoading(false);
    }
  }, [runId, workspaceId]);

  useEffect(() => {
    setTab("overview");
    setExpandedArtifact(null);
  }, [contender.id, runId]);

  useEffect(() => {
    if (tab === "logs") void loadEvents();
  }, [tab, loadEvents]);

  useEffect(() => {
    if (tab === "artifacts") void loadArtifacts();
  }, [tab, loadArtifacts]);

  useEffect(() => {
    if (!pollLive || !runId) return;
    const id = window.setInterval(() => {
      if (tab === "logs") void loadEvents();
      if (tab === "artifacts") void loadArtifacts();
    }, 5000);
    return () => window.clearInterval(id);
  }, [pollLive, runId, tab, loadEvents, loadArtifacts]);

  const reviewHref = run
    ? `/workspaces/${workspaceId}/projects/${projectId}/tasks/${run.taskId}`
    : null;

  return (
    <aside className={styles.inspector} aria-label="Agent inspector">
      <div className={styles.inspectorHead}>
        <div>
          <p className={styles.inspectorEyebrow}>Agent inspector</p>
          <h2 className={styles.inspectorTitle}>
            {titleCase(contender.profileKey)}
          </h2>
          <p className={styles.inspectorRepo}>{repoFullName}</p>
        </div>
        <button
          type="button"
          className={styles.inspectorClose}
          onClick={onClose}
          aria-label="Close inspector"
        >
          Close
        </button>
      </div>

      <span className={`${styles.statusBadge} ${statusBadgeClass}`}>
        {statusLabel}
      </span>

      <div className={styles.inspectorTabs} role="tablist" aria-label="Inspector">
        {(
          [
            ["overview", "Overview"],
            ["logs", "Logs"],
            ["artifacts", "Artifacts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.inspectorTab} ${
              tab === id ? styles.inspectorTabActive : ""
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {!run ? (
        <section className={styles.inspectorSection}>
          <p className={styles.inspectorEmpty}>
            No run yet for this agent. Standing by for the next task.
          </p>
        </section>
      ) : null}

      {run && tab === "overview" ? (
        <>
          <section className={styles.inspectorSection}>
            <h3 className={styles.inspectorSectionTitle}>Current task</h3>
            <p className={styles.inspectorTask}>
              {displayTaskTitle(run.taskTitle) || run.taskTitle}
            </p>
            <p className={styles.inspectorMeta}>
              Status {run.status.replace(/_/g, " ")}
              {" · "}
              Cost {formatUsd(run.actualCostMicros)}
            </p>
            <div className={styles.inspectorLinks}>
              {reviewHref ? (
                <Link href={reviewHref} className={styles.inspectorLink}>
                  Open delivery review
                </Link>
              ) : null}
              {run.prUrl ? (
                <a
                  href={run.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.inspectorLink}
                >
                  PR #{run.prNumber ?? "?"}
                </a>
              ) : null}
            </div>
            {run.errorCode ? (
              <p className={styles.inspectorError}>{run.errorCode}</p>
            ) : null}
          </section>

          <section className={styles.inspectorSection}>
            <h3 className={styles.inspectorSectionTitle}>Config</h3>
            <p className={styles.inspectorMeta}>
              {temperLabel(contender.temperament)} · {contender.strategy}
              {" · "}
              Budget {formatUsd(contender.budgetMicrosRemaining)} remaining
            </p>
          </section>
        </>
      ) : null}

      {run && tab === "logs" ? (
        <section className={styles.inspectorSection}>
          <h3 className={styles.inspectorSectionTitle}>Activity log</h3>
          {eventsLoading && events.length === 0 ? (
            <p className={styles.inspectorEmpty}>Loading events…</p>
          ) : eventsError ? (
            <p className={styles.inspectorError}>{eventsError}</p>
          ) : events.length === 0 ? (
            <p className={styles.inspectorEmpty}>
              {run.status === "QUEUED"
                ? "Queued — waiting for a worker to claim…"
                : "No events yet."}
            </p>
          ) : (
            <ol className={styles.logList}>
              {events.map((ev) => (
                <li key={ev.id} className={styles.logItem}>
                  <div className={styles.logMeta}>
                    <span className={styles.logSeq}>#{ev.seq}</span>
                    <span className={styles.logKind}>{ev.kind}</span>
                    <span className={styles.eventTime}>
                      {new Date(ev.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className={styles.logBody}>{eventMessage(ev)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {run && tab === "artifacts" ? (
        <section className={styles.inspectorSection}>
          <h3 className={styles.inspectorSectionTitle}>Artifacts</h3>
          {reviewHref ? (
            <div className={styles.inspectorLinks}>
              <Link href={reviewHref} className={styles.inspectorLink}>
                Open in delivery review
              </Link>
            </div>
          ) : null}
          {artifactsLoading && artifacts.length === 0 ? (
            <p className={styles.inspectorEmpty}>Loading artifacts…</p>
          ) : artifactsError ? (
            <p className={styles.inspectorError}>{artifactsError}</p>
          ) : artifacts.length === 0 ? (
            <p className={styles.inspectorEmpty}>
              No artifacts yet for this run.
            </p>
          ) : (
            <ul className={styles.artifactList}>
              {artifacts.map((a) => {
                const open = expandedArtifact === a.id;
                return (
                  <li key={a.id} className={styles.artifactItem}>
                    <button
                      type="button"
                      className={styles.artifactHead}
                      aria-expanded={open}
                      onClick={() =>
                        setExpandedArtifact(open ? null : a.id)
                      }
                    >
                      <span className={styles.artifactKind}>
                        {kindLabel(a.kind)}
                      </span>
                      <span className={styles.artifactSummary}>
                        {artifactSummary(a.meta)}
                      </span>
                      <span className={styles.eventTime}>
                        {new Date(a.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                    {open ? (
                      <pre className={styles.artifactPreview}>
                        {artifactPreview(a.meta)}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </aside>
  );
}
