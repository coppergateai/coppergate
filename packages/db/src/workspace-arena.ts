import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  getArenaForProject,
  killArena,
  listContendersForArena,
} from "./arena.js";
import { startProjectArena, stopProjectArena } from "./maintainer.js";
import { listAgentProfiles } from "./profiles.js";
import { listProjectsForWorkspace } from "./projects.js";
import { latestRunProgressHints, mergeRunActivityLine } from "./run-event-hints.js";
import {
  agentRuns,
  tasks,
  type AgentProfile,
  type Contender,
} from "./schema.js";

export type WorkspaceArenaLiveStatus = "LIVE" | "PAUSED" | "STOPPED";

export type WorkspaceArenaContenderRun = {
  id: string;
  status: string;
  taskId: string;
  taskTitle: string;
  actualCostMicros: number;
  prUrl: string | null;
  prNumber: number | null;
  errorCode: string | null;
  /** WINNER | LOSER | CANCELLED — losers are expected, not ops fires. */
  tournamentResult: string | null;
  updatedAt: string;
  /** Latest coding-path / failover honesty from run progress events (AG-013). */
  activityHint: string | null;
};

/** Failures older than this do not inflate Needs attention while the arena is live. */
export const STALE_FAILURE_ATTENTION_MS = 2 * 60 * 60 * 1000;

function isStaleFailureTimestamp(updatedAt: string, nowMs = Date.now()): boolean {
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t > STALE_FAILURE_ATTENTION_MS;
}

export type WorkspaceArenaContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  status: string;
  temperament: string | null;
  budgetMicrosRemaining: number;
  latestRun: WorkspaceArenaContenderRun | null;
};

export type WorkspaceArenaLastRun = {
  id: string;
  status: string;
  profileKey: string | null;
  errorCode: string | null;
  updatedAt: string;
};

/** Expected terminal failures — do not elevate lane severity. */
function isQuietFailureErrorCode(errorCode: string | null | undefined): boolean {
  return (
    errorCode === "stub_delivery" ||
    errorCode === "waiting_ci_timeout" ||
    errorCode === "validating_lease_expired" ||
    errorCode === "lease_expired_poison" ||
    // Operator closed the PR (or GitHub already closed it) — terminal, not an ops fire.
    errorCode === "pr_closed"
  );
}

export type WorkspaceArenaProjectLane = {
  projectId: string;
  projectName: string;
  repoFullName: string;
  arenaId: string | null;
  arenaStatus: string | null;
  contenders: WorkspaceArenaContenderView[];
  lastRun: WorkspaceArenaLastRun | null;
};

export type WorkspaceArenaSummary = {
  running: number;
  awaitingCi: number;
  needsAttention: number;
  idle: number;
};

export type WorkspaceArenaSnapshot = {
  workspaceId: string;
  status: WorkspaceArenaLiveStatus;
  summary: WorkspaceArenaSummary;
  syncedAt: string;
  projects: WorkspaceArenaProjectLane[];
};

export type WorkspaceArenaControlResult = {
  workspaceId: string;
  status: WorkspaceArenaLiveStatus;
  summary: WorkspaceArenaSummary;
  syncedAt: string;
  started: number;
  paused: number;
  stopped: number;
  errors: Array<{ projectId: string; message: string }>;
  projects: WorkspaceArenaProjectLane[];
};

export function isLiveArenaStatus(status: string | null | undefined): boolean {
  return status === "RUNNING" || status === "ARMED";
}

function deriveWorkspaceStatus(
  lanes: WorkspaceArenaProjectLane[],
): WorkspaceArenaLiveStatus {
  if (lanes.some((lane) => isLiveArenaStatus(lane.arenaStatus))) {
    return "LIVE";
  }
  if (lanes.some((lane) => lane.arenaStatus === "PAUSED")) {
    return "PAUSED";
  }
  return "STOPPED";
}

export type ClassifyContenderRuntimeOptions = {
  /** When false (paused/killed arena), terminal failures are history — not a live fire. */
  arenaLive?: boolean;
  /** Contender row status — eliminated agents are not ops fires. */
  contenderStatus?: string | null;
  /** Injected clock for stale-failure tests. */
  nowMs?: number;
};

/** Runtime bucket for a contender's latest run (Mission Control strip). */
export function classifyContenderRuntime(
  latestRun: WorkspaceArenaContenderRun | null,
  budgetMicrosRemaining: number,
  options?: ClassifyContenderRuntimeOptions,
): "running" | "awaitingCi" | "needsAttention" | "idle" {
  const arenaLive = options?.arenaLive ?? true;
  const nowMs = options?.nowMs ?? Date.now();
  // Contender budget is selection pressure (losers starve) — not an ops fire.
  void budgetMicrosRemaining;
  if (options?.contenderStatus === "ELIMINATED") return "idle";
  if (!latestRun) return "idle";
  const st = latestRun.status;
  // Soft-cancel / stop is a quiet terminal — not an ops fire to chase.
  if (st === "CANCELLED") return "idle";
  if (st === "RUNNING" || st === "QUEUED") return "running";
  if (st === "REVIEW_REQUIRED" || st === "VALIDATING" || st === "WAITING_CI") {
    // Pause/Stop is an intentional drain — don't turn mid-flight CI/review into ops fires.
    // Reaper still fails truly stuck VALIDATING/WAITING_CI by wall-clock.
    if (!arenaLive) return "idle";
    return "awaitingCi";
  }
  if (st === "FAILED" || st === "BLOCKED" || st === "EXPIRED") {
    // Last-session terminals stay quiet until the arena is live again.
    if (!arenaLive) return "idle";
    // Tournament losers and simulated-delivery stubs are expected outcomes.
    if (latestRun.tournamentResult === "LOSER") return "idle";
    if (isQuietFailureErrorCode(latestRun.errorCode)) return "idle";
    // Stale failures linger on the contender until the next fan-out — don't scream.
    if (isStaleFailureTimestamp(latestRun.updatedAt, nowMs)) return "idle";
    return "needsAttention";
  }
  // errorCode on non-failed terminals (e.g. incomplete after cancel) must not
  // inflate Needs attention while the arena is stopped.
  return "idle";
}

function deriveSummary(
  lanes: WorkspaceArenaProjectLane[],
): WorkspaceArenaSummary {
  const summary: WorkspaceArenaSummary = {
    running: 0,
    awaitingCi: 0,
    needsAttention: 0,
    idle: 0,
  };
  for (const lane of lanes) {
    const arenaLive = isLiveArenaStatus(lane.arenaStatus);
    for (const c of lane.contenders) {
      // Historical eliminations are not part of the live roster strip.
      if (c.status === "ELIMINATED") continue;
      const bucket = classifyContenderRuntime(
        c.latestRun,
        c.budgetMicrosRemaining,
        { arenaLive, contenderStatus: c.status },
      );
      summary[bucket] += 1;
    }
  }
  return summary;
}

function profileTemperamentMap(
  profiles: AgentProfile[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of profiles) {
    if (!p.workspaceId && !map.has(p.key)) {
      map.set(p.key, p.temperament);
    }
  }
  for (const p of profiles) {
    if (p.workspaceId) {
      map.set(p.key, p.temperament);
    }
  }
  return map;
}

async function latestRunsByContender(
  db: Database,
  workspaceId: string,
  projectId: string,
  contenderIds: string[],
): Promise<Map<string, WorkspaceArenaContenderRun>> {
  const map = new Map<string, WorkspaceArenaContenderRun>();
  if (contenderIds.length === 0) return map;

  const rows = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      contenderId: agentRuns.contenderId,
      taskId: agentRuns.taskId,
      taskTitle: tasks.title,
      actualCostMicros: agentRuns.actualCostMicros,
      prUrl: agentRuns.prUrl,
      prNumber: agentRuns.prNumber,
      errorCode: agentRuns.errorCode,
      tournamentResult: agentRuns.tournamentResult,
      updatedAt: agentRuns.updatedAt,
    })
    .from(agentRuns)
    .innerJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        eq(agentRuns.projectId, projectId),
        inArray(agentRuns.contenderId, contenderIds),
      ),
    )
    .orderBy(desc(agentRuns.updatedAt));

  for (const row of rows) {
    if (!row.contenderId || map.has(row.contenderId)) continue;
    map.set(row.contenderId, {
      id: row.id,
      status: row.status,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      actualCostMicros: row.actualCostMicros,
      prUrl: row.prUrl,
      prNumber: row.prNumber,
      errorCode: row.errorCode,
      tournamentResult: row.tournamentResult ?? null,
      updatedAt: row.updatedAt.toISOString(),
      activityHint: null,
    });
  }

  const runIds = [...new Set([...map.values()].map((r) => r.id))];
  const hints = await latestRunProgressHints(db, runIds);
  for (const entry of map.values()) {
    const hint = hints.get(entry.id);
    if (!hint) continue;
    const line = mergeRunActivityLine("", hint, "running");
    entry.activityHint = line || hint.codingPathLine || hint.failoverLine;
  }

  return map;
}

function contenderViews(
  pool: Contender[],
  temperamentByKey: Map<string, string>,
  runsByContender: Map<string, WorkspaceArenaContenderRun>,
): WorkspaceArenaContenderView[] {
  // Spectacle / Mission Control only need the live roster — eliminated history
  // was inflating "1313 idle" after repeated spawn/eliminate cycles.
  return pool
    .filter((c) => c.status !== "ELIMINATED")
    .map((c) => ({
      id: c.id,
      profileKey: c.profileKey,
      strategy: c.strategy,
      status: c.status,
      temperament: temperamentByKey.get(c.profileKey) ?? null,
      budgetMicrosRemaining: c.budgetMicrosRemaining,
      latestRun: runsByContender.get(c.id) ?? null,
    }));
}

async function lastRunForProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<WorkspaceArenaLastRun | null> {
  const [run] = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      agentProfileKey: agentRuns.agentProfileKey,
      errorCode: agentRuns.errorCode,
      updatedAt: agentRuns.updatedAt,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        eq(agentRuns.projectId, projectId),
      ),
    )
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    profileKey: run.agentProfileKey ?? null,
    errorCode: run.errorCode ?? null,
    updatedAt: run.updatedAt.toISOString(),
  };
}

function laneSeverity(lane: WorkspaceArenaProjectLane): number {
  const arenaLive = isLiveArenaStatus(lane.arenaStatus);
  let worst = 0;
  for (const c of lane.contenders) {
    const bucket = classifyContenderRuntime(
      c.latestRun,
      c.budgetMicrosRemaining,
      { arenaLive, contenderStatus: c.status },
    );
    const rank =
      bucket === "needsAttention"
        ? 3
        : bucket === "running"
          ? 2
          : bucket === "awaitingCi"
            ? 1
            : 0;
    if (rank > worst) worst = rank;
  }
  // Only elevate by fresh last-run failure while the arena is actively fighting.
  if (
    arenaLive &&
    (lane.lastRun?.status === "FAILED" ||
      lane.lastRun?.status === "BLOCKED" ||
      lane.lastRun?.status === "EXPIRED") &&
    lane.lastRun.updatedAt &&
    !isQuietFailureErrorCode(lane.lastRun.errorCode) &&
    !isStaleFailureTimestamp(lane.lastRun.updatedAt)
  ) {
    worst = Math.max(worst, 3);
  }
  return worst;
}

/** Needs attention first, then running, awaiting CI, idle. */
export function sortArenaProjectLanes(
  projects: WorkspaceArenaProjectLane[],
): WorkspaceArenaProjectLane[] {
  return [...projects].sort((a, b) => {
    const diff = laneSeverity(b) - laneSeverity(a);
    if (diff !== 0) return diff;
    return a.projectName.localeCompare(b.projectName);
  });
}

function snapshotPayload(
  workspaceId: string,
  projects: WorkspaceArenaProjectLane[],
): WorkspaceArenaSnapshot {
  const ordered = sortArenaProjectLanes(projects);
  return {
    workspaceId,
    status: deriveWorkspaceStatus(ordered),
    summary: deriveSummary(ordered),
    syncedAt: new Date().toISOString(),
    projects: ordered,
  };
}

/** Aggregate per-project arenas + contenders for a workspace. */
export async function listWorkspaceArenaSnapshot(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceArenaSnapshot> {
  const rows = await listProjectsForWorkspace(db, workspaceId);
  const profiles = await listAgentProfiles(db, workspaceId);
  const temperamentByKey = profileTemperamentMap(profiles);

  const projects: WorkspaceArenaProjectLane[] = [];
  for (const { project, repository } of rows) {
    const arena = await getArenaForProject(db, {
      workspaceId,
      projectId: project.id,
    });
    const pool = arena
      ? await listContendersForArena(db, {
          workspaceId,
          arenaId: arena.id,
        })
      : [];
    const runsByContender = await latestRunsByContender(
      db,
      workspaceId,
      project.id,
      pool.map((c) => c.id),
    );
    const lastRun = await lastRunForProject(db, workspaceId, project.id);
    projects.push({
      projectId: project.id,
      projectName: project.name,
      repoFullName:
        repository.baseRepoFullName ||
        `${repository.owner}/${repository.name}`,
      arenaId: arena?.id ?? null,
      arenaStatus: arena?.status ?? null,
      contenders: contenderViews(pool, temperamentByKey, runsByContender),
      lastRun,
    });
  }

  return snapshotPayload(workspaceId, projects);
}

function controlFromSnapshot(
  snapshot: WorkspaceArenaSnapshot,
  counts: { started: number; paused: number; stopped: number },
  errors: Array<{ projectId: string; message: string }>,
): WorkspaceArenaControlResult {
  return {
    workspaceId: snapshot.workspaceId,
    status: snapshot.status,
    summary: snapshot.summary,
    syncedAt: snapshot.syncedAt,
    started: counts.started,
    paused: counts.paused,
    stopped: counts.stopped,
    errors,
    projects: snapshot.projects,
  };
}

/** Fan-out Start/Resume across all non-archived projects. Partial success is OK. */
export async function startWorkspaceArena(
  db: Database,
  input: { workspaceId: string; actor: string },
): Promise<WorkspaceArenaControlResult> {
  const rows = await listProjectsForWorkspace(db, input.workspaceId);
  const errors: Array<{ projectId: string; message: string }> = [];
  let started = 0;

  for (const { project } of rows) {
    try {
      await startProjectArena(db, {
        workspaceId: input.workspaceId,
        projectId: project.id,
        actor: input.actor,
      });
      started += 1;
    } catch (err) {
      errors.push({
        projectId: project.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const snapshot = await listWorkspaceArenaSnapshot(db, input.workspaceId);
  return controlFromSnapshot(
    snapshot,
    { started, paused: 0, stopped: 0 },
    errors,
  );
}

/** Fan-out soft Pause across all non-archived projects. Partial success is OK. */
export async function stopWorkspaceArena(
  db: Database,
  input: { workspaceId: string; actor: string },
): Promise<WorkspaceArenaControlResult> {
  const rows = await listProjectsForWorkspace(db, input.workspaceId);
  const errors: Array<{ projectId: string; message: string }> = [];
  let paused = 0;

  for (const { project } of rows) {
    try {
      await stopProjectArena(db, {
        workspaceId: input.workspaceId,
        projectId: project.id,
        actor: input.actor,
      });
      paused += 1;
    } catch (err) {
      errors.push({
        projectId: project.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const snapshot = await listWorkspaceArenaSnapshot(db, input.workspaceId);
  return controlFromSnapshot(
    snapshot,
    { started: 0, paused, stopped: 0 },
    errors,
  );
}

/** Fan-out hard Kill across all non-archived projects. Partial success is OK. */
export async function killWorkspaceArena(
  db: Database,
  input: { workspaceId: string; actor: string },
): Promise<WorkspaceArenaControlResult> {
  const rows = await listProjectsForWorkspace(db, input.workspaceId);
  const errors: Array<{ projectId: string; message: string }> = [];
  let stopped = 0;

  for (const { project } of rows) {
    try {
      const arena = await getArenaForProject(db, {
        workspaceId: input.workspaceId,
        projectId: project.id,
      });
      if (!arena) {
        errors.push({
          projectId: project.id,
          message: "Arena not found for project",
        });
        continue;
      }
      await killArena(db, {
        workspaceId: input.workspaceId,
        arenaId: arena.id,
        actor: input.actor,
      });
      stopped += 1;
    } catch (err) {
      errors.push({
        projectId: project.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const snapshot = await listWorkspaceArenaSnapshot(db, input.workspaceId);
  return controlFromSnapshot(
    snapshot,
    { started: 0, paused: 0, stopped },
    errors,
  );
}
