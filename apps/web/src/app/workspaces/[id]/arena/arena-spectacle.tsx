"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SkeletonStack } from "@/components/app/ui";
import styles from "./arena-spectacle.module.css";

type ContenderRun = {
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

type ContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  status: string;
  temperament: string | null;
  budgetMicrosRemaining: number;
  latestRun: ContenderRun | null;
};

type ProjectLane = {
  projectId: string;
  projectName: string;
  repoFullName: string;
  arenaId: string | null;
  arenaStatus: string | null;
  contenders: ContenderView[];
  lastRun: {
    id: string;
    status: string;
    profileKey: string | null;
    updatedAt: string;
  } | null;
};

type Summary = {
  running: number;
  awaitingCi: number;
  needsAttention: number;
  idle: number;
};

type Snapshot = {
  workspaceId: string;
  status: "LIVE" | "STOPPED";
  summary: Summary;
  syncedAt: string;
  projects: ProjectLane[];
};

type RuntimeState = "running" | "awaitingCi" | "needsAttention" | "idle";

type RunEvent = {
  id: string;
  seq: number;
  kind: string;
  payload: unknown;
  createdAt: string;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
};

type SelectedAgent = {
  projectId: string;
  contenderId: string;
};

function isLiveStatus(status: string | null | undefined) {
  return status === "RUNNING" || status === "ARMED";
}

function classifyRuntime(c: ContenderView): RuntimeState {
  if (c.budgetMicrosRemaining <= 0) return "needsAttention";
  const run = c.latestRun;
  if (!run) return "idle";
  const st = run.status;
  if (st === "RUNNING" || st === "QUEUED") return "running";
  if (
    st === "VALIDATING" ||
    st === "WAITING_CI" ||
    st === "REVIEW_REQUIRED"
  ) {
    return "awaitingCi";
  }
  if (
    st === "FAILED" ||
    st === "BLOCKED" ||
    st === "EXPIRED" ||
    Boolean(run.errorCode)
  ) {
    return "needsAttention";
  }
  return "idle";
}

function runtimeLabel(state: RuntimeState): string {
  switch (state) {
    case "running":
      return "Running";
    case "awaitingCi":
      return "Awaiting CI";
    case "needsAttention":
      return "Needs attention";
    default:
      return "Idle";
  }
}

function projectRuntime(lane: ProjectLane): RuntimeState {
  const states = lane.contenders.map(classifyRuntime);
  if (states.includes("needsAttention")) return "needsAttention";
  if (states.includes("running")) return "running";
  if (states.includes("awaitingCi")) return "awaitingCi";
  if (isLiveStatus(lane.arenaStatus)) return "running";
  return "idle";
}

function projectStatusLabel(lane: ProjectLane): string {
  if (!lane.arenaStatus) return "No arena";
  if (lane.arenaStatus === "PAUSED") return "Paused";
  if (lane.arenaStatus === "KILLED") return "Stopped";
  const runtime = projectRuntime(lane);
  if (runtime === "awaitingCi") return "Awaiting CI";
  if (runtime === "needsAttention") return "Needs attention";
  if (isLiveStatus(lane.arenaStatus)) return "Running";
  return lane.arenaStatus;
}

function activityLine(c: ContenderView, state: RuntimeState): string {
  const run = c.latestRun;
  if (state === "needsAttention" && c.budgetMicrosRemaining <= 0) {
    return "Budget exhausted";
  }
  if (!run) {
    return state === "idle" ? "Standing by" : "No active run";
  }
  if (run.errorCode) return run.errorCode.replace(/_/g, " ");
  if (run.taskTitle) {
    if (state === "running") return run.taskTitle;
    if (state === "awaitingCi") return `Awaiting validation · ${run.taskTitle}`;
    return run.taskTitle;
  }
  return run.status.replace(/_/g, " ");
}

function formatUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(dollars < 1 ? 3 : 2)}`;
}

function formatSyncAge(syncedAt: string | null, nowMs: number): string {
  if (!syncedAt) return "—";
  const delta = Math.max(0, Math.floor((nowMs - Date.parse(syncedAt)) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  return `${mins}m ago`;
}

function titleCase(key: string): string {
  if (!key) return "Agent";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function temperLabel(temperament: string | null): string {
  if (!temperament) return "Balanced";
  return temperament.charAt(0).toUpperCase() + temperament.slice(1);
}

function phaseIndex(status: string | null | undefined): number {
  switch (status) {
    case "QUEUED":
      return 0;
    case "RUNNING":
      return 1;
    case "VALIDATING":
    case "WAITING_CI":
      return 2;
    case "REVIEW_REQUIRED":
    case "ACCEPTED":
    case "DONE":
      return 3;
    default:
      return -1;
  }
}

const PHASES = ["Queued", "Running", "Validating", "Review"] as const;

function eventSummary(event: RunEvent): string {
  const payload = event.payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.summary === "string") return obj.summary;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.status === "string") return obj.status;
  }
  return event.kind;
}

export function ArenaSpectacle({
  workspaceId,
  workspaceName,
  isOwner,
}: Props) {
  const searchParams = useSearchParams();
  const focusProjectId = searchParams.get("focus");

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expandInitialized = useRef(false);
  const [selected, setSelected] = useState<SelectedAgent | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const applySnapshot = useCallback((data: Snapshot) => {
    setSnapshot({
      workspaceId: data.workspaceId,
      status: data.status,
      summary: data.summary ?? {
        running: 0,
        awaitingCi: 0,
        needsAttention: 0,
        idle: 0,
      },
      syncedAt: data.syncedAt ?? new Date().toISOString(),
      projects: data.projects ?? [],
    });
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/arena`, {
      credentials: "same-origin",
    });
    const data = (await res.json()) as Snapshot & {
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load arena");
      setLoading(false);
      return;
    }
    applySnapshot(data);
    setError(null);
    setLoading(false);
  }, [workspaceId, applySnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = snapshot?.status === "LIVE";

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      void load();
    }, 7000);
    return () => window.clearInterval(id);
  }, [live, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!snapshot || loading || expandInitialized.current) return;
    expandInitialized.current = true;
    const next = new Set<string>();
    if (focusProjectId) {
      next.add(focusProjectId);
    } else {
      const active = snapshot.projects.find((lane) => {
        const runtime = projectRuntime(lane);
        return runtime !== "idle" || isLiveStatus(lane.arenaStatus);
      });
      if (active) next.add(active.projectId);
      else if (snapshot.projects[0]) next.add(snapshot.projects[0].projectId);
    }
    setExpanded(next);
  }, [snapshot, loading, focusProjectId]);

  useEffect(() => {
    if (!focusProjectId) return;
    setExpanded((prev) => {
      if (prev.has(focusProjectId)) return prev;
      const next = new Set(prev);
      next.add(focusProjectId);
      return next;
    });
  }, [focusProjectId]);

  useEffect(() => {
    if (!focusProjectId || loading) return;
    const el = document.getElementById(`lane-${focusProjectId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusProjectId, loading, snapshot?.projects.length]);

  const selectedAgent = useMemo(() => {
    if (!selected || !snapshot) return null;
    const lane = snapshot.projects.find(
      (p) => p.projectId === selected.projectId,
    );
    if (!lane) return null;
    const contender = lane.contenders.find(
      (c) => c.id === selected.contenderId,
    );
    if (!contender) return null;
    return { lane, contender, state: classifyRuntime(contender) };
  }, [selected, snapshot]);

  useEffect(() => {
    if (!selectedAgent?.contender.latestRun) {
      setEvents([]);
      return;
    }
    const runId = selectedAgent.contender.latestRun.id;
    let cancelled = false;
    setEventsLoading(true);
    void fetch(
      `/api/runs/${runId}/events?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    )
      .then(async (res) => {
        const data = (await res.json()) as { events?: RunEvent[] };
        if (!cancelled && res.ok) {
          setEvents((data.events ?? []).slice(-12).reverse());
        }
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgent?.contender.latestRun?.id, workspaceId]);

  async function control(action: "start" | "pause" | "stop") {
    if (action === "stop") {
      const ok = window.confirm(
        "Stop all arenas? This kills open runs and freezes enqueue until Resume.",
      );
      if (!ok) return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/arena`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as Snapshot & {
        errors?: Array<{ projectId: string; message: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Request failed");
        return;
      }
      applySnapshot(data);
      if (data.errors && data.errors.length > 0) {
        setError(
          `${data.errors.length} project(s) failed: ${data.errors
            .map((e) => e.message)
            .slice(0, 2)
            .join("; ")}`,
        );
      }
    } finally {
      setPending(false);
    }
  }

  const ordered = useMemo(() => {
    const projects = snapshot?.projects ?? [];
    if (!focusProjectId) return projects;
    return [...projects].sort((a, b) => {
      if (a.projectId === focusProjectId) return -1;
      if (b.projectId === focusProjectId) return 1;
      return 0;
    });
  }, [snapshot?.projects, focusProjectId]);

  const summary = snapshot?.summary ?? {
    running: 0,
    awaitingCi: 0,
    needsAttention: 0,
    idle: 0,
  };

  function toggleExpand(projectId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  return (
    <div
      className={`${styles.stage} ${selected ? styles.stageWithInspector : ""}`}
      data-live={live ? "true" : "false"}
    >
      <div className={styles.mainCol}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <p className={styles.eyebrow}>Arena / {workspaceName}</p>
            <span
              className={`${styles.pill} ${live ? styles.pillLive : ""}`}
              aria-live="polite"
            >
              <span className={styles.pillDot} aria-hidden />
              {live ? "Live" : "Stopped"}
            </span>
          </div>
          <h1 className={styles.brand}>{workspaceName}</h1>
          <p className={styles.lede}>Autonomous engineering operations</p>

          <div className={styles.controls}>
            <span className={styles.syncMeta} aria-live="polite">
              Last sync: {formatSyncAge(snapshot?.syncedAt ?? null, nowMs)}
            </span>
            {isOwner ? (
              <div className={styles.ctaRow}>
                {!live ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnResume}`}
                    disabled={pending}
                    onClick={() => void control("start")}
                  >
                    Resume all
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPause}`}
                    disabled={pending}
                    onClick={() => void control("pause")}
                  >
                    Pause all
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnStop}`}
                  disabled={pending || ordered.length === 0}
                  onClick={() => void control("stop")}
                >
                  Stop all
                </button>
              </div>
            ) : null}
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
        </header>

        <section className={styles.summary} aria-label="Arena summary">
          <div className={`${styles.metric} ${styles.metricRunning}`}>
            <p className={styles.metricValue}>{summary.running}</p>
            <p className={styles.metricLabel}>Running</p>
          </div>
          <div className={`${styles.metric} ${styles.metricWaiting}`}>
            <p className={styles.metricValue}>{summary.awaitingCi}</p>
            <p className={styles.metricLabel}>Awaiting CI</p>
          </div>
          <div className={`${styles.metric} ${styles.metricAttention}`}>
            <p className={styles.metricValue}>{summary.needsAttention}</p>
            <p className={styles.metricLabel}>Needs attention</p>
          </div>
          <div className={`${styles.metric} ${styles.metricIdle}`}>
            <p className={styles.metricValue}>{summary.idle}</p>
            <p className={styles.metricLabel}>Idle</p>
          </div>
        </section>

        {loading ? (
          <div className={styles.loading}>
            <SkeletonStack rows={5} />
          </div>
        ) : ordered.length === 0 ? (
          <p className={styles.empty}>
            No active projects yet. Bind a repo, then Resume the workspace
            arena.
          </p>
        ) : (
          <div className={styles.lanes} role="list">
            {ordered.map((lane) => {
              const laneRuntime = projectRuntime(lane);
              const isExpanded = expanded.has(lane.projectId);
              const focused = lane.projectId === focusProjectId;
              const hotAgents = lane.contenders
                .map((c) => ({ c, state: classifyRuntime(c) }))
                .filter(({ state }) => state !== "idle")
                .slice(0, 3);
              const activePhase = phaseIndex(lane.lastRun?.status);

              return (
                <article
                  key={lane.projectId}
                  id={`lane-${lane.projectId}`}
                  role="listitem"
                  className={`${styles.lane} ${
                    focused ? styles.laneFocused : ""
                  } ${styles[`laneTone_${laneRuntime}`] ?? ""}`}
                >
                  <button
                    type="button"
                    className={styles.laneHeader}
                    onClick={() => toggleExpand(lane.projectId)}
                    aria-expanded={isExpanded}
                  >
                    <div className={styles.laneMeta}>
                      <div className={styles.laneTitleRow}>
                        <h2 className={styles.laneName}>{lane.projectName}</h2>
                        <span
                          className={`${styles.statusBadge} ${
                            styles[`badge_${laneRuntime}`]
                          }`}
                        >
                          {projectStatusLabel(lane)}
                        </span>
                      </div>
                      <p className={styles.laneRepo}>
                        {lane.repoFullName}
                        {lane.lastRun
                          ? ` · Last run: ${lane.lastRun.status.replace(/_/g, " ")}`
                          : ""}
                      </p>
                    </div>
                    {!isExpanded ? (
                      <div className={styles.hotAgents}>
                        {hotAgents.length === 0 ? (
                          <span className={styles.hotEmpty}>All idle</span>
                        ) : (
                          hotAgents.map(({ c, state }) => (
                            <span
                              key={c.id}
                              className={`${styles.hotChip} ${
                                styles[`chip_${state}`]
                              }`}
                            >
                              {titleCase(c.profileKey)}
                              {state === "running" ? " · Running" : ""}
                              {state === "awaitingCi" ? " · Waiting" : ""}
                              {state === "needsAttention" ? " · Attention" : ""}
                            </span>
                          ))
                        )}
                      </div>
                    ) : null}
                    <span className={styles.expandHint}>
                      {isExpanded
                        ? "Hide agents"
                        : `View ${lane.contenders.length} agents`}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className={styles.laneBody}>
                      <ol className={styles.phases} aria-label="Execution phase">
                        {PHASES.map((phase, i) => (
                          <li
                            key={phase}
                            className={`${styles.phase} ${
                              i === activePhase ? styles.phaseActive : ""
                            } ${i < activePhase ? styles.phaseDone : ""}`}
                          >
                            {phase}
                          </li>
                        ))}
                      </ol>
                      <div className={styles.agents}>
                        {lane.contenders.length === 0 ? (
                          <p className={styles.emptyAgents}>
                            Contenders arm on Resume
                          </p>
                        ) : (
                          lane.contenders.map((c) => {
                            const state = classifyRuntime(c);
                            const selectedHere =
                              selected?.contenderId === c.id &&
                              selected.projectId === lane.projectId;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={`${styles.agent} ${
                                  styles[`agent_${state}`]
                                } ${
                                  state === "running" ? styles.agentPulse : ""
                                } ${selectedHere ? styles.agentSelected : ""}`}
                                onClick={() =>
                                  setSelected({
                                    projectId: lane.projectId,
                                    contenderId: c.id,
                                  })
                                }
                              >
                                <div className={styles.agentTop}>
                                  <span className={styles.agentState}>
                                    {runtimeLabel(state)}
                                  </span>
                                  <span className={styles.agentRole}>
                                    {titleCase(c.profileKey)}
                                  </span>
                                </div>
                                <p className={styles.agentMode}>
                                  {temperLabel(c.temperament)} · {c.strategy}
                                </p>
                                <p className={styles.agentActivity}>
                                  {activityLine(c, state)}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selectedAgent ? (
        <aside className={styles.inspector} aria-label="Agent inspector">
          <div className={styles.inspectorHead}>
            <div>
              <p className={styles.inspectorEyebrow}>Agent inspector</p>
              <h2 className={styles.inspectorTitle}>
                {titleCase(selectedAgent.contender.profileKey)}
              </h2>
              <p className={styles.inspectorRepo}>
                {selectedAgent.lane.repoFullName}
              </p>
            </div>
            <button
              type="button"
              className={styles.inspectorClose}
              onClick={() => setSelected(null)}
              aria-label="Close inspector"
            >
              Close
            </button>
          </div>

          <span
            className={`${styles.statusBadge} ${
              styles[`badge_${selectedAgent.state}`]
            }`}
          >
            {runtimeLabel(selectedAgent.state)}
          </span>

          <section className={styles.inspectorSection}>
            <h3 className={styles.inspectorSectionTitle}>Current task</h3>
            {selectedAgent.contender.latestRun ? (
              <>
                <p className={styles.inspectorTask}>
                  {selectedAgent.contender.latestRun.taskTitle}
                </p>
                <p className={styles.inspectorMeta}>
                  Status{" "}
                  {selectedAgent.contender.latestRun.status.replace(/_/g, " ")}
                  {" · "}
                  Cost{" "}
                  {formatUsd(
                    selectedAgent.contender.latestRun.actualCostMicros,
                  )}
                </p>
                <div className={styles.inspectorLinks}>
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${selectedAgent.lane.projectId}/tasks/${selectedAgent.contender.latestRun.taskId}`}
                    className={styles.inspectorLink}
                  >
                    Open delivery review
                  </Link>
                  {selectedAgent.contender.latestRun.prUrl ? (
                    <a
                      href={selectedAgent.contender.latestRun.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.inspectorLink}
                    >
                      PR #{selectedAgent.contender.latestRun.prNumber ?? "?"}
                    </a>
                  ) : null}
                </div>
                {selectedAgent.contender.latestRun.errorCode ? (
                  <p className={styles.inspectorError}>
                    {selectedAgent.contender.latestRun.errorCode}
                  </p>
                ) : null}
              </>
            ) : (
              <p className={styles.inspectorEmpty}>
                No run yet for this agent. Standing by for the next task.
              </p>
            )}
          </section>

          <section className={styles.inspectorSection}>
            <h3 className={styles.inspectorSectionTitle}>Config</h3>
            <p className={styles.inspectorMeta}>
              {temperLabel(selectedAgent.contender.temperament)} ·{" "}
              {selectedAgent.contender.strategy}
              {" · "}
              Budget {formatUsd(selectedAgent.contender.budgetMicrosRemaining)}{" "}
              remaining
            </p>
          </section>

          <section className={styles.inspectorSection}>
            <h3 className={styles.inspectorSectionTitle}>Recent activity</h3>
            {eventsLoading ? (
              <p className={styles.inspectorEmpty}>Loading events…</p>
            ) : events.length === 0 ? (
              <p className={styles.inspectorEmpty}>No events yet.</p>
            ) : (
              <ul className={styles.eventList}>
                {events.map((ev) => (
                  <li key={ev.id} className={styles.eventItem}>
                    <span className={styles.eventTime}>
                      {new Date(ev.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className={styles.eventText}>{eventSummary(ev)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      ) : null}
    </div>
  );
}
