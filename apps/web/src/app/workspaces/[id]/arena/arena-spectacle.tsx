"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SkeletonStack } from "@/components/app/ui";
import { displayTaskTitle } from "@/lib/display-title";
import { AgentInspector } from "./agent-inspector";
import styles from "./arena-mission.module.css";

type ContenderRun = {
  id: string;
  status: string;
  taskId: string;
  taskTitle: string;
  actualCostMicros: number;
  prUrl: string | null;
  prNumber: number | null;
  errorCode: string | null;
  tournamentResult?: string | null;
  updatedAt: string;
  activityHint?: string | null;
};

const STALE_FAILURE_MS = 2 * 60 * 60 * 1000;

function isStaleFailure(updatedAt: string): boolean {
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > STALE_FAILURE_MS;
}

type ContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  status: string;
  temperament: string | null;
  budgetMicrosRemaining: number;
  eliminatedAt: string | null;
  latestRun: ContenderRun | null;
};

type EliminatedContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  temperament: string | null;
  eliminatedAt: string | null;
};

type PoolSummary = {
  activeWithBudget: number;
  eliminated: number;
  activeBroke: number;
  total: number;
};

type ProjectLane = {
  projectId: string;
  projectName: string;
  repoFullName: string;
  arenaId: string | null;
  arenaStatus: string | null;
  contenders: ContenderView[];
  eliminated: EliminatedContenderView[];
  pool: PoolSummary;
  lastRun: {
    id: string;
    status: string;
    profileKey: string | null;
    errorCode?: string | null;
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
  status: "LIVE" | "PAUSED" | "STOPPED";
  summary: Summary;
  syncedAt: string;
  projects: ProjectLane[];
};

type RuntimeState = "running" | "awaitingCi" | "needsAttention" | "idle";

const RUNTIME_RANK: Record<RuntimeState, number> = {
  needsAttention: 0,
  running: 1,
  awaitingCi: 2,
  idle: 3,
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

/** Keep in sync with `classifyContenderRuntime` in `@coppergate/db`. */
function classifyRuntime(
  c: ContenderView,
  arenaLive: boolean,
): RuntimeState {
  // Budget elimination is selection, not a human ops fire.
  void c.budgetMicrosRemaining;
  if (c.status === "ELIMINATED") return "idle";
  const run = c.latestRun;
  if (!run) return "idle";
  const st = run.status;
  // Soft-cancel / stop is a quiet terminal — not an ops fire to chase.
  if (st === "CANCELLED") return "idle";
  if (st === "RUNNING" || st === "QUEUED") return "running";
  if (st === "REVIEW_REQUIRED" || st === "VALIDATING" || st === "WAITING_CI") {
    // Pause/Stop drains the queue — mid-flight CI/review is not an ops fire until Resume.
    if (!arenaLive) return "idle";
    return "awaitingCi";
  }
  if (st === "FAILED" || st === "BLOCKED" || st === "EXPIRED") {
    // Last-session terminals stay quiet until the arena is live again.
    if (!arenaLive) return "idle";
    if (run.tournamentResult === "LOSER") return "idle";
    if (run.errorCode === "stub_delivery") return "idle";
    if (
      run.errorCode === "waiting_ci_timeout" ||
      run.errorCode === "validating_lease_expired" ||
      run.errorCode === "lease_expired_poison" ||
      run.errorCode === "pr_closed"
    ) {
      return "idle";
    }
    if (isStaleFailure(run.updatedAt)) return "idle";
    return "needsAttention";
  }
  // errorCode on non-failed terminals (e.g. incomplete after cancel) must not
  // inflate Needs attention while the arena is stopped.
  return "idle";
}

function runtimeLabel(state: RuntimeState, eliminated?: boolean): string {
  if (eliminated) return "Eliminated";
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

function poolCaption(pool: PoolSummary | undefined): string {
  if (!pool) return "";
  const parts: string[] = [];
  if (pool.activeWithBudget > 0) {
    parts.push(
      `${pool.activeWithBudget} with budget`,
    );
  }
  if (pool.eliminated > 0) {
    parts.push(`${pool.eliminated} eliminated`);
  }
  if (pool.activeBroke > 0) {
    parts.push(`${pool.activeBroke} broke`);
  }
  return parts.length ? parts.join(" · ") : "No active contenders";
}

function projectRuntime(lane: ProjectLane): RuntimeState {
  const arenaLive = isLiveStatus(lane.arenaStatus);
  const states = lane.contenders.map((c) => classifyRuntime(c, arenaLive));
  if (states.includes("needsAttention")) return "needsAttention";
  if (states.includes("running")) return "running";
  if (states.includes("awaitingCi")) return "awaitingCi";
  // Armed/live with no hot agents is idle roster — not an active run.
  return "idle";
}

function projectStatusLabel(lane: ProjectLane): string {
  if (!lane.arenaStatus) return "No arena";
  if (lane.arenaStatus === "PAUSED") return "Paused";
  if (lane.arenaStatus === "KILLED") return "Stopped";
  const runtime = projectRuntime(lane);
  if (runtime === "awaitingCi") return "Awaiting CI";
  if (runtime === "needsAttention") return "Needs attention";
  if (runtime === "running") return "Running";
  if (isLiveStatus(lane.arenaStatus)) return "Live";
  return lane.arenaStatus;
}

function activityLine(c: ContenderView, state: RuntimeState): string {
  const run = c.latestRun;
  if (!run) {
    if (c.budgetMicrosRemaining <= 0) return "Eliminated — budget spent";
    return state === "idle" ? "Standing by" : "No active run";
  }
  const title = displayTaskTitle(run.taskTitle, 72);
  if (state === "idle") {
    // Quiet historical terminals — do not surface old error codes as live status.
    if (c.budgetMicrosRemaining <= 0) return "Standing by · budget spent";
    if (title) return `Last · ${title}`;
    return "Standing by";
  }
  if (state === "needsAttention" && c.budgetMicrosRemaining <= 0) {
    return `Failed · budget spent · ${run.errorCode?.replace(/_/g, " ") ?? run.status}`;
  }
  if (run.errorCode === "pr_closed") return "PR closed — terminal";
  if (run.errorCode) return run.errorCode.replace(/_/g, " ");
  if (
    state === "running" &&
    typeof run.activityHint === "string" &&
    run.activityHint.trim()
  ) {
    return run.activityHint;
  }
  if (title) {
    if (state === "running") return title;
    if (state === "awaitingCi") return `Awaiting validation · ${title}`;
    return title;
  }
  return run.status.replace(/_/g, " ");
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

const TONE = {
  running: {
    lane: styles.laneTone_running,
    badge: styles.badge_running,
    chip: styles.chip_running,
    agent: styles.agent_running,
  },
  awaitingCi: {
    lane: styles.laneTone_awaitingCi,
    badge: styles.badge_awaitingCi,
    chip: styles.chip_awaitingCi,
    agent: styles.agent_awaitingCi,
  },
  needsAttention: {
    lane: styles.laneTone_needsAttention,
    badge: styles.badge_needsAttention,
    chip: styles.chip_needsAttention,
    agent: styles.agent_needsAttention,
  },
  idle: {
    lane: styles.laneTone_idle,
    badge: styles.badge_idle,
    chip: "",
    agent: styles.agent_idle,
  },
} as const;

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
  /** Idle roster stays collapsed — full fan-out is too noisy for ops. */
  const [showIdle, setShowIdle] = useState<Set<string>>(new Set());
  const [showEliminated, setShowEliminated] = useState<Set<string>>(new Set());
  const expandInitialized = useRef(false);
  const [selected, setSelected] = useState<SelectedAgent | null>(null);
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
      projects: (data.projects ?? []).map((lane) => ({
        ...lane,
        eliminated: lane.eliminated ?? [],
        pool: lane.pool ?? {
          activeWithBudget: lane.contenders?.length ?? 0,
          eliminated: 0,
          activeBroke: 0,
          total: lane.contenders?.length ?? 0,
        },
      })),
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
  const paused = snapshot?.status === "PAUSED";
  const workspaceStatusLabel = live ? "Live" : paused ? "Paused" : "Stopped";

  useEffect(() => {
    if (!live && !paused) return;
    const id = window.setInterval(() => {
      void load();
    }, 7000);
    return () => window.clearInterval(id);
  }, [live, paused, load]);

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
      // Prefer lanes that need human action after the attention classifier.
      const attention = snapshot.projects.find(
        (lane) => projectRuntime(lane) === "needsAttention",
      );
      const active =
        attention ??
        snapshot.projects.find((lane) => {
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
    let contender = lane.contenders.find((c) => c.id === selected.contenderId);
    let eliminated = false;
    if (!contender) {
      const gone = lane.eliminated?.find((c) => c.id === selected.contenderId);
      if (!gone) return null;
      eliminated = true;
      contender = {
        id: gone.id,
        profileKey: gone.profileKey,
        strategy: gone.strategy,
        status: "ELIMINATED",
        temperament: gone.temperament,
        budgetMicrosRemaining: 0,
        eliminatedAt: gone.eliminatedAt,
        latestRun: null,
      };
    }
    return {
      lane,
      contender,
      eliminated,
      state: eliminated
        ? "idle"
        : classifyRuntime(contender, isLiveStatus(lane.arenaStatus)),
    };
  }, [selected, snapshot]);

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
      data-paused={paused ? "true" : "false"}
    >
      <div className={styles.mainCol}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <p className={styles.eyebrow}>Arena / {workspaceName}</p>
            <span
              className={`${styles.pill} ${live ? styles.pillLive : paused ? styles.pillPaused : ""}`}
              aria-live="polite"
            >
              <span className={styles.pillDot} aria-hidden />
              {workspaceStatusLabel}
            </span>
          </div>
          <h1 className={styles.brand}>Arena</h1>
          <p className={styles.lede}>
            {paused ? (
              <>
                Pause all is draining in-flight work across {workspaceName}.
                Resume to enqueue again, or Stop all to kill runs — idle and
                awaiting-CI counts while paused are not ops fires.
              </>
            ) : (
              <>
                Contenders compete under budget across {workspaceName}. Fitness
                and CI pick survivors — Pause all drains the queue; Stop all
                hard-kills runs until Resume.
              </>
            )}
          </p>

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
                    {paused ? "Resume all" : "Start all"}
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

        <section className={styles.summaryStrip} aria-label="Arena summary">
          <p className={styles.summaryItem}>
            <strong className={styles.summaryRunning}>{summary.running}</strong>{" "}
            running
          </p>
          <p className={styles.summaryItem}>
            <strong className={styles.summaryWaiting}>
              {summary.awaitingCi}
            </strong>{" "}
            awaiting CI
          </p>
          <p className={styles.summaryItem}>
            <strong className={styles.summaryAttention}>
              {summary.needsAttention}
            </strong>{" "}
            need attention
          </p>
          <p className={styles.summaryItem}>
            <strong className={styles.summaryIdle}>{summary.idle}</strong> idle
          </p>
        </section>

        {loading ? (
          <div className={styles.loading}>
            <SkeletonStack rows={5} />
          </div>
        ) : ordered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No projects armed</p>
            <p className={styles.emptyBody}>
              No Open ID, no spend. Bind a repo and an Open Program path, then
              Resume — Arena reserves only against program lines.
            </p>
          </div>
        ) : (
          <div className={styles.lanes} role="list">
            {ordered.map((lane) => {
              const laneRuntime = projectRuntime(lane);
              const isExpanded = expanded.has(lane.projectId);
              const focused = lane.projectId === focusProjectId;
              const arenaLive = isLiveStatus(lane.arenaStatus);
              const hotAgents = lane.contenders
                .map((c) => ({ c, state: classifyRuntime(c, arenaLive) }))
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
                  } ${TONE[laneRuntime].lane}`}
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
                          className={`${styles.statusBadge} ${TONE[laneRuntime].badge}`}
                        >
                          {projectStatusLabel(lane)}
                        </span>
                      </div>
                      <p className={styles.laneRepo}>
                        {lane.repoFullName}
                        {lane.pool ? ` · ${poolCaption(lane.pool)}` : ""}
                        {(() => {
                          if (
                            !lane.lastRun ||
                            laneRuntime === "running" ||
                            laneRuntime === "awaitingCi"
                          ) {
                            return "";
                          }
                          // Live + idle: current state is enough — skip stale
                          // FAILED/CANCELLED captions that fight the Live badge.
                          if (
                            isLiveStatus(lane.arenaStatus) &&
                            (lane.lastRun.status === "FAILED" ||
                              lane.lastRun.status === "CANCELLED")
                          ) {
                            return "";
                          }
                          return ` · Last ${lane.lastRun.status.replace(/_/g, " ").toLowerCase()}`;
                        })()}
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
                              className={`${styles.hotChip} ${TONE[state].chip}`}
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
                        : hotAgents.length > 0
                          ? `View ${hotAgents.length} active · ${lane.contenders.length - hotAgents.length} idle`
                          : `View roster · ${lane.contenders.length} idle`}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className={styles.laneBody}>
                      <div className={styles.phases} aria-label="Execution phase">
                        {PHASES.map((phase, i) => (
                          <span
                            key={phase}
                            className={`${styles.phase} ${
                              i === activePhase ? styles.phaseActive : ""
                            } ${i < activePhase ? styles.phaseDone : ""}`}
                          >
                            {phase}
                          </span>
                        ))}
                      </div>
                      {(() => {
                        const ranked = [...lane.contenders]
                          .map((c) => ({
                            c,
                            state: classifyRuntime(c, arenaLive),
                          }))
                          .sort(
                            (a, b) =>
                              RUNTIME_RANK[a.state] - RUNTIME_RANK[b.state],
                          );
                        const active = ranked.filter((x) => x.state !== "idle");
                        const idle = ranked.filter((x) => x.state === "idle");
                        const idleOpen = showIdle.has(lane.projectId);
                        const renderAgent = (
                          c: ContenderView,
                          state: RuntimeState,
                          compact: boolean,
                        ) => {
                          const selectedHere =
                            selected?.contenderId === c.id &&
                            selected.projectId === lane.projectId;
                          const hot = state !== "idle";
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`${styles.agent} ${TONE[state].agent} ${
                                state === "running" ? styles.agentPulse : ""
                              } ${selectedHere ? styles.agentSelected : ""} ${
                                compact ? styles.agentCompact : ""
                              }`}
                              onClick={() =>
                                setSelected({
                                  projectId: lane.projectId,
                                  contenderId: c.id,
                                })
                              }
                            >
                              <div className={styles.agentTop}>
                                <span className={styles.agentRole}>
                                  {titleCase(c.profileKey)}
                                </span>
                                <span className={styles.agentState}>
                                  {runtimeLabel(state)}
                                </span>
                              </div>
                              {hot ? (
                                <p className={styles.agentActivity}>
                                  {activityLine(c, state)}
                                </p>
                              ) : compact ? null : (
                                <p className={styles.agentMode}>
                                  {temperLabel(c.temperament)} · {c.strategy}
                                </p>
                              )}
                            </button>
                          );
                        };

                        if (lane.contenders.length === 0) {
                          return (
                            <p className={styles.emptyAgents}>
                              Contenders arm on Resume
                            </p>
                          );
                        }

                        return (
                          <>
                            <div className={styles.agents}>
                              {active.length === 0 ? (
                                <p className={styles.emptyAgents}>
                                  No active agents — roster standing by
                                </p>
                              ) : (
                                active.map(({ c, state }) =>
                                  renderAgent(c, state, false),
                                )
                              )}
                            </div>
                            {idle.length > 0 ? (
                              <div className={styles.idleRoster}>
                                <button
                                  type="button"
                                  className={styles.idleToggle}
                                  aria-expanded={idleOpen}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowIdle((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(lane.projectId)) {
                                        next.delete(lane.projectId);
                                      } else {
                                        next.add(lane.projectId);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  {idleOpen
                                    ? `Hide ${idle.length} idle`
                                    : `Show ${idle.length} idle`}
                                </button>
                                {idleOpen ? (
                                  <div
                                    className={`${styles.agents} ${styles.agentsIdle}`}
                                  >
                                    {idle.map(({ c, state }) =>
                                      renderAgent(c, state, true),
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {(() => {
                              const eliminated = lane.eliminated ?? [];
                              if (eliminated.length === 0) return null;
                              const elimOpen = showEliminated.has(lane.projectId);
                              return (
                                <div className={styles.idleRoster}>
                                  <button
                                    type="button"
                                    className={styles.idleToggle}
                                    aria-expanded={elimOpen}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowEliminated((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(lane.projectId)) {
                                          next.delete(lane.projectId);
                                        } else {
                                          next.add(lane.projectId);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    {elimOpen
                                      ? `Hide ${eliminated.length} eliminated`
                                      : `Show ${eliminated.length} eliminated`}
                                  </button>
                                  {elimOpen ? (
                                    <div
                                      className={`${styles.agents} ${styles.agentsIdle}`}
                                    >
                                      {eliminated.map((c) => (
                                        <button
                                          key={c.id}
                                          type="button"
                                          className={`${styles.agent} ${styles.agent_idle} ${styles.agentCompact}`}
                                          onClick={() =>
                                            setSelected({
                                              projectId: lane.projectId,
                                              contenderId: c.id,
                                            })
                                          }
                                        >
                                          <div className={styles.agentTop}>
                                            <span className={styles.agentRole}>
                                              {titleCase(c.profileKey)}
                                            </span>
                                            <span className={styles.agentState}>
                                              Eliminated
                                            </span>
                                          </div>
                                          <p className={styles.agentActivity}>
                                            Budget exhausted
                                            {c.eliminatedAt
                                              ? ` · ${formatSyncAge(c.eliminatedAt, nowMs)}`
                                              : ""}
                                          </p>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selectedAgent ? (
        <AgentInspector
          workspaceId={workspaceId}
          projectId={selectedAgent.lane.projectId}
          repoFullName={selectedAgent.lane.repoFullName}
          contender={selectedAgent.contender}
          statusLabel={runtimeLabel(
            selectedAgent.state,
            selectedAgent.eliminated,
          )}
          statusBadgeClass={TONE[selectedAgent.state].badge ?? ""}
          eliminated={selectedAgent.eliminated}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
