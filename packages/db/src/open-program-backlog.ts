/**
 * Workspace Open Program backlog — markdown rows + runtime in-flight overlay.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  extractArchitectureIdFromTitle,
  parseArchitectureProgramRows,
  type ArchitectureProgramRow,
} from "./architecture-backlog.js";
import {
  fetchArchitectureBacklogMarkdown,
  listInFlightArchitectureIds,
  parseMaintainerPolicy,
} from "./maintainer.js";
import { listProjectsForWorkspace } from "./projects.js";
import { tasks } from "./schema.js";

export type OpenProgramEffectiveStatus = "open" | "in_flight" | "done";

export type OpenProgramBacklogItem = {
  id: string;
  title: string;
  notes: string;
  section: string | null;
  /** Markdown status before runtime overlay. */
  programStatus: "open" | "done";
  /** Done (markdown) > In flight (board) > Open. */
  status: OpenProgramEffectiveStatus;
  architectureRepo: string;
  architecturePaths: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskStatus: string | null;
  fetchError: string | null;
};

export type OpenProgramBacklogProgram = {
  architectureRepo: string;
  architecturePaths: string;
  projectIds: string[];
  projectNames: string[];
  itemCount: number;
  openCount: number;
  inFlightCount: number;
  doneCount: number;
  fetchError: string | null;
};

export type WorkspaceOpenProgramBacklog = {
  workspaceId: string;
  items: OpenProgramBacklogItem[];
  programs: OpenProgramBacklogProgram[];
  unboundProjectCount: number;
};

export type InFlightTaskRef = {
  architectureId: string;
  taskId: string;
  taskStatus: string;
  projectId: string;
  projectName: string;
};

const IN_FLIGHT_UI_STATUSES = [
  "DRAFT",
  "READY_FOR_APPROVAL",
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
  "IN_REVIEW",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "ACCEPTED",
] as const;

/** Pure overlay used by UI + tests. */
export function applyOpenProgramRuntimeStatus(
  row: ArchitectureProgramRow,
  inFlightIds: Set<string>,
): OpenProgramEffectiveStatus {
  if (row.status === "done") return "done";
  if (inFlightIds.has(row.id.toUpperCase())) return "in_flight";
  return "open";
}

function programKey(repo: string, paths: string): string {
  return `${repo.trim().toLowerCase()}::${paths.trim().toLowerCase()}`;
}

async function listInFlightTaskRefs(
  db: Database,
  workspaceId: string,
  projectNameById: Map<string, string>,
): Promise<Map<string, InFlightTaskRef>> {
  const openTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.status, [...IN_FLIGHT_UI_STATUSES]),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(400);

  const byArch = new Map<string, InFlightTaskRef>();
  for (const t of openTasks) {
    const archId = extractArchitectureIdFromTitle(t.title);
    if (!archId || byArch.has(archId)) continue;
    byArch.set(archId, {
      architectureId: archId,
      taskId: t.id,
      taskStatus: t.status,
      projectId: t.projectId,
      projectName: projectNameById.get(t.projectId) ?? "project",
    });
  }
  return byArch;
}

/**
 * Load Open Program rows for every project that binds an architecture repo/path.
 */
export async function getWorkspaceOpenProgramBacklog(
  db: Database,
  workspaceId: string,
  opts?: { architectureToken?: string | null },
): Promise<WorkspaceOpenProgramBacklog> {
  const projectRows = await listProjectsForWorkspace(db, workspaceId);
  const projectNameById = new Map(
    projectRows.map(({ project }) => [project.id, project.name]),
  );

  type Bound = {
    projectId: string;
    projectName: string;
    architectureRepo: string;
    architecturePaths: string;
  };

  const bound: Bound[] = [];
  let unboundProjectCount = 0;

  for (const { project } of projectRows) {
    const policy = parseMaintainerPolicy(project.maintainerPolicyJson);
    const repo = policy.architectureRepo?.trim() ?? "";
    const paths = policy.architecturePaths?.trim() ?? "";
    if (!repo || !paths) {
      unboundProjectCount += 1;
      continue;
    }
    bound.push({
      projectId: project.id,
      projectName: project.name,
      architectureRepo: repo,
      architecturePaths: paths,
    });
  }

  const inFlightTaskById = await listInFlightTaskRefs(
    db,
    workspaceId,
    projectNameById,
  );
  const inFlightIds = new Set(inFlightTaskById.keys());

  // Also merge listInFlightArchitectureIds (includes PR + cooldown) via first bound project.
  if (bound[0]) {
    try {
      const extra = await listInFlightArchitectureIds(db, {
        workspaceId,
        projectId: bound[0].projectId,
        architectureToken: opts?.architectureToken,
      });
      for (const id of extra) inFlightIds.add(id.toUpperCase());
    } catch {
      /* board titles alone still overlay */
    }
  }

  // Fetch unique architecture sources once.
  const sourceCache = new Map<
    string,
    { rows: ArchitectureProgramRow[]; fetchError: string | null }
  >();

  for (const b of bound) {
    const key = programKey(b.architectureRepo, b.architecturePaths);
    if (sourceCache.has(key)) continue;
    try {
      const md = await fetchArchitectureBacklogMarkdown({
        token: opts?.architectureToken,
        repo: b.architectureRepo,
        paths: b.architecturePaths,
      });
      if (!md.trim()) {
        sourceCache.set(key, {
          rows: [],
          fetchError:
            "Could not load Open Program markdown — check architecture bind and token.",
        });
      } else {
        sourceCache.set(key, {
          rows: parseArchitectureProgramRows(md),
          fetchError: null,
        });
      }
    } catch (err) {
      sourceCache.set(key, {
        rows: [],
        fetchError:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "Architecture fetch failed",
      });
    }
  }

  // Prefer project that owns in-flight work when deduping (repo, id).
  type Candidate = OpenProgramBacklogItem & { key: string };
  const byItemKey = new Map<string, Candidate>();

  for (const b of bound) {
    const key = programKey(b.architectureRepo, b.architecturePaths);
    const source = sourceCache.get(key)!;
    if (source.fetchError && source.rows.length === 0) {
      // Surface one synthetic bind error row per program+project for empty fetch.
      const errKey = `${key}::fetch-error::${b.projectId}`;
      if (!byItemKey.has(errKey)) {
        byItemKey.set(errKey, {
          key: errKey,
          id: "—",
          title: "Open Program unavailable",
          notes: source.fetchError,
          section: null,
          programStatus: "open",
          status: "open",
          architectureRepo: b.architectureRepo,
          architecturePaths: b.architecturePaths,
          projectId: b.projectId,
          projectName: b.projectName,
          taskId: null,
          taskStatus: null,
          fetchError: source.fetchError,
        });
      }
      continue;
    }

    for (const row of source.rows) {
      const itemKey = `${key}::${row.id}`;
      const flight = inFlightTaskById.get(row.id);
      const status = applyOpenProgramRuntimeStatus(row, inFlightIds);
      const ownsFlight = flight?.projectId === b.projectId;
      const next: Candidate = {
        key: itemKey,
        id: row.id,
        title: row.title,
        notes: row.notes,
        section: row.section,
        programStatus: row.status,
        status,
        architectureRepo: b.architectureRepo,
        architecturePaths: b.architecturePaths,
        projectId: ownsFlight && flight ? flight.projectId : b.projectId,
        projectName:
          ownsFlight && flight ? flight.projectName : b.projectName,
        taskId: flight?.taskId ?? null,
        taskStatus: flight?.taskStatus ?? null,
        fetchError: null,
      };

      const prev = byItemKey.get(itemKey);
      if (!prev) {
        byItemKey.set(itemKey, next);
        continue;
      }
      // Prefer the project that owns in-flight work.
      if (ownsFlight && prev.projectId !== flight?.projectId) {
        byItemKey.set(itemKey, next);
      }
    }
  }

  const items = [...byItemKey.values()]
    .filter((i) => i.id !== "—" || i.fetchError)
    .sort((a, b) => {
      const rank = (s: OpenProgramEffectiveStatus) =>
        s === "in_flight" ? 0 : s === "open" ? 1 : 2;
      const rd = rank(a.status) - rank(b.status);
      if (rd !== 0) return rd;
      return a.id.localeCompare(b.id);
    })
    .map(({ key: _k, ...rest }) => rest);

  // Program rollups
  const programMap = new Map<string, OpenProgramBacklogProgram>();
  for (const b of bound) {
    const key = programKey(b.architectureRepo, b.architecturePaths);
    const existing = programMap.get(key);
    if (existing) {
      if (!existing.projectIds.includes(b.projectId)) {
        existing.projectIds.push(b.projectId);
        existing.projectNames.push(b.projectName);
      }
      continue;
    }
    const source = sourceCache.get(key);
    programMap.set(key, {
      architectureRepo: b.architectureRepo,
      architecturePaths: b.architecturePaths,
      projectIds: [b.projectId],
      projectNames: [b.projectName],
      itemCount: 0,
      openCount: 0,
      inFlightCount: 0,
      doneCount: 0,
      fetchError: source?.fetchError ?? null,
    });
  }

  for (const item of items) {
    if (item.fetchError && item.id === "—") continue;
    const key = programKey(item.architectureRepo, item.architecturePaths);
    const prog = programMap.get(key);
    if (!prog) continue;
    prog.itemCount += 1;
    if (item.status === "open") prog.openCount += 1;
    else if (item.status === "in_flight") prog.inFlightCount += 1;
    else prog.doneCount += 1;
  }

  return {
    workspaceId,
    items,
    programs: [...programMap.values()],
    unboundProjectCount,
  };
}
