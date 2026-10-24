import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  getArenaForProject,
  listContendersForArena,
} from "./arena.js";
import { startProjectArena, stopProjectArena } from "./maintainer.js";
import { listAgentProfiles } from "./profiles.js";
import { listProjectsForWorkspace } from "./projects.js";
import { agentRuns, type AgentProfile, type Contender } from "./schema.js";

export type WorkspaceArenaLiveStatus = "LIVE" | "STOPPED";

export type WorkspaceArenaContenderView = {
  id: string;
  profileKey: string;
  strategy: string;
  status: string;
  temperament: string | null;
  budgetMicrosRemaining: number;
};

export type WorkspaceArenaLastRun = {
  id: string;
  status: string;
  profileKey: string | null;
  updatedAt: string;
};

export type WorkspaceArenaProjectLane = {
  projectId: string;
  projectName: string;
  repoFullName: string;
  arenaId: string | null;
  arenaStatus: string | null;
  contenders: WorkspaceArenaContenderView[];
  lastRun: WorkspaceArenaLastRun | null;
};

export type WorkspaceArenaSnapshot = {
  workspaceId: string;
  status: WorkspaceArenaLiveStatus;
  projects: WorkspaceArenaProjectLane[];
};

export type WorkspaceArenaControlResult = {
  workspaceId: string;
  status: WorkspaceArenaLiveStatus;
  started: number;
  stopped: number;
  errors: Array<{ projectId: string; message: string }>;
  projects: WorkspaceArenaProjectLane[];
};

function isLiveArenaStatus(status: string | null | undefined): boolean {
  return status === "RUNNING" || status === "ARMED";
}

function deriveWorkspaceStatus(
  lanes: WorkspaceArenaProjectLane[],
): WorkspaceArenaLiveStatus {
  return lanes.some((lane) => isLiveArenaStatus(lane.arenaStatus))
    ? "LIVE"
    : "STOPPED";
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

function contenderViews(
  pool: Contender[],
  temperamentByKey: Map<string, string>,
): WorkspaceArenaContenderView[] {
  return pool.map((c) => ({
    id: c.id,
    profileKey: c.profileKey,
    strategy: c.strategy,
    status: c.status,
    temperament: temperamentByKey.get(c.profileKey) ?? null,
    budgetMicrosRemaining: c.budgetMicrosRemaining,
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
    updatedAt: run.updatedAt.toISOString(),
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
    const lastRun = await lastRunForProject(db, workspaceId, project.id);
    projects.push({
      projectId: project.id,
      projectName: project.name,
      repoFullName: repository.baseRepoFullName || `${repository.owner}/${repository.name}`,
      arenaId: arena?.id ?? null,
      arenaStatus: arena?.status ?? null,
      contenders: contenderViews(pool, temperamentByKey),
      lastRun,
    });
  }

  return {
    workspaceId,
    status: deriveWorkspaceStatus(projects),
    projects,
  };
}

/** Fan-out Start across all non-archived projects. Partial success is OK. */
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
  return {
    workspaceId: input.workspaceId,
    status: snapshot.status,
    started,
    stopped: 0,
    errors,
    projects: snapshot.projects,
  };
}

/** Fan-out Stop across all non-archived projects. Partial success is OK. */
export async function stopWorkspaceArena(
  db: Database,
  input: { workspaceId: string; actor: string },
): Promise<WorkspaceArenaControlResult> {
  const rows = await listProjectsForWorkspace(db, input.workspaceId);
  const errors: Array<{ projectId: string; message: string }> = [];
  let stopped = 0;

  for (const { project } of rows) {
    try {
      await stopProjectArena(db, {
        workspaceId: input.workspaceId,
        projectId: project.id,
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
  return {
    workspaceId: input.workspaceId,
    status: snapshot.status,
    started: 0,
    stopped,
    errors,
    projects: snapshot.projects,
  };
}
