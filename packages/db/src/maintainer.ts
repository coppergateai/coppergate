import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  approveBrief,
  createBriefDraft,
  getLatestBriefForProject,
  recordAuditEvent,
} from "./briefs.js";
import {
  getProjectSpendSummary,
  rollMonthlyBudgetIfDue,
  setProjectBudget,
} from "./budgets.js";
import { getRunCiFitness } from "./ci-evidence.js";
import { setProjectAutonomyLevel, setProjectMergeEnabled } from "./project-policy.js";
import {
  ensureArenaForProject,
  getArenaForProject,
  pauseArena,
  resumeArena,
  setArenaMinHuman,
} from "./arena.js";
import {
  applySpawnProfilesToArena,
  BOUNDED_KEYS,
} from "./profiles.js";
import {
  agentProfiles,
  agentRuns,
  arenas,
  auditEvents,
  budgets,
  maintainerEvents,
  milestones,
  projects,
  tasks,
  type AgentProfile,
  type Arena,
  type MaintainerEvent,
  type Project,
  type Task,
} from "./schema.js";
import {
  approveTask,
  decideTaskReview,
  enqueueQueuedTask,
  submitTaskForApproval,
} from "./task-transitions.js";
import { listRunsForTask } from "./runs.js";
import { armSignalEvent, listSignalEvents } from "./signals.js";
import { generateProjectPlan } from "./plans.js";
import {
  getProjectForWorkspace,
  setProjectMultiRepoPolicy,
} from "./projects.js";

/** Canonical micro-budget: $5/mo = 5_000_000 micros. */
export const DEFAULT_MONTHLY_BUDGET_MICROS = 5_000_000;

export type MaintainerPolicy = {
  enabled: boolean;
  monthlyBudgetMicros: number;
  softAlertRatio: number;
  autoMerge: boolean;
  autoRelease: boolean;
  selfImprove: boolean;
  communityReplies: boolean;
  /** When true, enable multi-repo + coordinated PRs for product stacks. */
  coordinatedMultiRepo: boolean;
  allowedSignalProviders: string[];
  pathAllowlist: string[];
  maxTournamentN: number;
  visionBriefId: string | null;
  replanIntervalDays: number;
  /** After vision replan, auto-submit root DRAFT tasks (min_human queues them). */
  autoQueueReplanTasks: boolean;
  /** Cap how many replan tasks are submitted per cycle. */
  maxAutoQueuePerReplan: number;
  /**
   * While arena is RUNNING and budget remains, refill the backlog as soon as
   * the board is idle (do not wait for replanIntervalDays).
   */
  continuousBacklog: boolean;
  /** daily = maintainer-YYYY-MM-DD; semver_patch = v0.YYYYMMDD.N */
  releaseTagStyle: "daily" | "semver_patch";
};

export const DEFAULT_MAINTAINER_POLICY: MaintainerPolicy = {
  enabled: true,
  monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS,
  softAlertRatio: 0.8,
  autoMerge: true,
  autoRelease: true,
  selfImprove: true,
  communityReplies: true,
  coordinatedMultiRepo: false,
  allowedSignalProviders: ["*", "ci_failure", "sentry", "dependabot", "codeql"],
  pathAllowlist: [],
  maxTournamentN: 2,
  visionBriefId: null,
  replanIntervalDays: 7,
  autoQueueReplanTasks: true,
  maxAutoQueuePerReplan: 2,
  continuousBacklog: true,
  releaseTagStyle: "daily",
};

/** Open delivery statuses that keep the autonomous board "busy". */
const OPEN_DELIVERY_STATUSES = [
  "DRAFT",
  "READY_FOR_APPROVAL",
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "REVIEW_REQUIRED",
] as const;

/** Minimum residual budget (micros) before inventing a new cycle. */
export const MIN_REPLAN_AVAILABLE_MICROS = 100_000;

/**
 * Decide whether the scheduler should invent the next maintainer cycle.
 * Continuous mode refills as soon as the board is idle under budget.
 */
export function shouldReplanVision(input: {
  lastVisionReplanAt: Date | null | undefined;
  replanIntervalDays: number;
  continuousBacklog: boolean;
  openWorkCount: number;
  availableMicros: number;
  minAvailableMicros?: number;
  nowMs?: number;
}): boolean {
  const min =
    input.minAvailableMicros ?? MIN_REPLAN_AVAILABLE_MICROS;
  if (input.availableMicros <= min) return false;
  if (input.continuousBacklog && input.openWorkCount === 0) return true;
  const replanMs = Math.max(1, input.replanIntervalDays) * 24 * 60 * 60 * 1000;
  if (!input.lastVisionReplanAt) return true;
  const now = input.nowMs ?? Date.now();
  return now - input.lastVisionReplanAt.getTime() >= replanMs;
}

export class MaintainerError extends Error {
  readonly code: "not_found" | "invalid" | "forbidden";
  constructor(code: MaintainerError["code"], message: string) {
    super(message);
    this.name = "MaintainerError";
    this.code = code;
  }
}

export function parseMaintainerPolicy(
  raw: string | null | undefined,
): MaintainerPolicy {
  if (!raw) return { ...DEFAULT_MAINTAINER_POLICY, enabled: false };
  try {
    const v = JSON.parse(raw) as Partial<MaintainerPolicy>;
    return {
      ...DEFAULT_MAINTAINER_POLICY,
      ...v,
      monthlyBudgetMicros:
        typeof v.monthlyBudgetMicros === "number" && v.monthlyBudgetMicros >= 0
          ? v.monthlyBudgetMicros
          : DEFAULT_MAINTAINER_POLICY.monthlyBudgetMicros,
      softAlertRatio:
        typeof v.softAlertRatio === "number" &&
        v.softAlertRatio > 0 &&
        v.softAlertRatio <= 1
          ? v.softAlertRatio
          : DEFAULT_MAINTAINER_POLICY.softAlertRatio,
      allowedSignalProviders: Array.isArray(v.allowedSignalProviders)
        ? v.allowedSignalProviders.filter((x) => typeof x === "string")
        : DEFAULT_MAINTAINER_POLICY.allowedSignalProviders,
      pathAllowlist: Array.isArray(v.pathAllowlist)
        ? v.pathAllowlist.filter((x) => typeof x === "string")
        : [],
      maxTournamentN:
        typeof v.maxTournamentN === "number" && v.maxTournamentN >= 1
          ? Math.min(3, Math.floor(v.maxTournamentN))
          : 2,
      replanIntervalDays:
        typeof v.replanIntervalDays === "number" && v.replanIntervalDays >= 1
          ? Math.floor(v.replanIntervalDays)
          : 7,
      autoQueueReplanTasks:
        typeof v.autoQueueReplanTasks === "boolean"
          ? v.autoQueueReplanTasks
          : DEFAULT_MAINTAINER_POLICY.autoQueueReplanTasks,
      maxAutoQueuePerReplan:
        typeof v.maxAutoQueuePerReplan === "number" &&
        v.maxAutoQueuePerReplan >= 1
          ? Math.min(5, Math.floor(v.maxAutoQueuePerReplan))
          : DEFAULT_MAINTAINER_POLICY.maxAutoQueuePerReplan,
      continuousBacklog:
        typeof v.continuousBacklog === "boolean"
          ? v.continuousBacklog
          : DEFAULT_MAINTAINER_POLICY.continuousBacklog,
      releaseTagStyle:
        v.releaseTagStyle === "semver_patch" ? "semver_patch" : "daily",
    };
  } catch {
    return { ...DEFAULT_MAINTAINER_POLICY, enabled: false };
  }
}

/**
 * Pick the run eligible for maintainer auto-accept.
 * Tournament tasks require an explicit WINNER; solo tasks use latest run.
 */
export function selectAutoAcceptRun<
  T extends {
    tournamentId: string | null;
    tournamentResult: string | null;
  },
>(runs: T[]): T | null {
  if (runs.length === 0) return null;
  const winner = runs.find((r) => r.tournamentResult === "WINNER");
  if (winner) return winner;
  const inTournament = runs.some((r) => r.tournamentId != null);
  if (inTournament) return null;
  return runs[0] ?? null;
}

/** True when task allowedPaths intersects policy pathAllowlist (empty allowlist = allow all). */
export function taskMatchesPathAllowlist(
  allowedPathsJson: string | null | undefined,
  pathAllowlist: string[],
): boolean {
  if (!pathAllowlist.length) return true;
  let paths: string[] = [];
  try {
    const parsed = JSON.parse(allowedPathsJson ?? "[]");
    if (Array.isArray(parsed)) {
      paths = parsed.filter((p): p is string => typeof p === "string");
    }
  } catch {
    paths = [];
  }
  if (paths.includes("**/*") || paths.includes("**")) return true;
  return pathAllowlist.some((allow) =>
    paths.some(
      (p) =>
        p === allow ||
        p.startsWith(allow.replace(/\*\*$/, "")) ||
        allow.startsWith(p.replace(/\*\*$/, "")),
    ),
  );
}

export function buildMaintainerReleaseTag(
  style: MaintainerPolicy["releaseTagStyle"],
  when = new Date(),
  mergeCount = 1,
): string {
  if (style === "semver_patch") {
    const y = when.getUTCFullYear();
    const m = String(when.getUTCMonth() + 1).padStart(2, "0");
    const d = String(when.getUTCDate()).padStart(2, "0");
    const n = Math.max(1, Math.min(99, mergeCount));
    return `v0.${y}${m}${d}.${n}`;
  }
  return `maintainer-${when.toISOString().slice(0, 10)}`;
}

export function serializeMaintainerPolicy(policy: MaintainerPolicy): string {
  return JSON.stringify(policy);
}

async function recordMaintainerEvent(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    kind: string;
    payload?: Record<string, unknown>;
  },
): Promise<MaintainerEvent> {
  const [row] = await db
    .insert(maintainerEvents)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: input.kind,
      payload: JSON.stringify(input.payload ?? {}),
      createdAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to record maintainer event");
  return row;
}

/**
 * Enable fully autonomous maintainer mode on a project.
 * Sets L2 + mergeEnabled + monthly budget + arena min_human.
 */
export async function enableMaintainerMode(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    policy?: Partial<MaintainerPolicy>;
  },
): Promise<{ project: Project; policy: MaintainerPolicy }> {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new MaintainerError("not_found", "Project not found");
  }

  const brief = await getLatestBriefForProject(
    db,
    input.workspaceId,
    input.projectId,
  );
  const policy: MaintainerPolicy = {
    ...DEFAULT_MAINTAINER_POLICY,
    ...input.policy,
    enabled: true,
    visionBriefId:
      input.policy?.visionBriefId ??
      brief?.id ??
      project.currentBriefId ??
      null,
  };

  const softAlert = Math.floor(
    policy.monthlyBudgetMicros * policy.softAlertRatio,
  );

  await setProjectBudget(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    capMicros: policy.monthlyBudgetMicros,
    softAlertMicros: softAlert,
    actor: input.actor,
    status: "active",
    period: "monthly",
  });

  await setProjectAutonomyLevel(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    autonomyLevel: "L2",
    actor: input.actor,
  });

  await setProjectMergeEnabled(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    mergeEnabled: true,
    actor: input.actor,
  });

  const { arena } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    defaultContenderN: Math.min(2, policy.maxTournamentN),
    minHuman: true,
  });
  if (!arena.minHuman) {
    await setArenaMinHuman(db, {
      workspaceId: input.workspaceId,
      arenaId: arena.id,
      minHuman: true,
      actor: input.actor,
    });
  }

  if (policy.coordinatedMultiRepo) {
    await setProjectMultiRepoPolicy(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      policy: {
        enabled: true,
        maxSecondaryRepos: 5,
        maxSecondaryFiles: 40,
        coordinatedPrs: true,
      },
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({
      maintainerEnabled: true,
      maintainerPolicyJson: serializeMaintainerPolicy(policy),
      updatedAt: now,
    })
    .where(eq(projects.id, input.projectId))
    .returning();

  if (!updated) {
    throw new MaintainerError("not_found", "Failed to enable maintainer mode");
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.enable",
    targetType: "project",
    targetId: input.projectId,
    meta: { policy },
  });
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "tick",
    payload: { action: "enable", policy },
  });

  return { project: updated, policy };
}

export type ArenaControlResult = {
  arena: Arena;
  project: Project;
  resumedTasks: number;
  maintainerEnabled: boolean;
  bootstrappedBrief: boolean;
  queuedFromReplan: number;
};

/**
 * No human brief/plan: approve a default vision and auto-queue the next
 * maintainer cycle tasks so Start is the only gate.
 */
export async function ensureAutonomousVisionAndBacklog(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<{ bootstrappedBrief: boolean; queuedFromReplan: number }> {
  const bound = await getProjectForWorkspace(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!bound) {
    throw new MaintainerError("not_found", "Project not found");
  }
  const repo = bound.repository.baseRepoFullName;
  const name = bound.project.name;

  let bootstrappedBrief = false;
  let brief = await getLatestBriefForProject(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!brief || brief.status !== "approved") {
    const draft = await createBriefDraft(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      rawIdea: `Autonomous maintainer for ${repo}: propose, build, verify, merge, and release small improvements without human plan entry.`,
      content: {
        title: `${name} — autonomous ship loop`,
        targetUser: "Product maintainers",
        problem: `Keep ${repo} improving under a monthly spend cap with survivor selection.`,
        scope:
          "Tiny, reviewable changes on the primary repo: bugs, CI, docs, and small features. Prefer go test / CI green.",
        nonGoals:
          "Large rewrites, multi-repo coordinated ships without policy, unbounded spend.",
        acceptanceCriteria: [
          "Scoped task queued without human brief entry",
          "Survivor PR opens on the primary repository",
          "CI green; maintainer auto-accepts the tournament winner",
        ],
        clarifyingAnswers: [],
      },
    });
    brief = await approveBrief(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      briefId: draft.id,
      actor: input.actor,
    });
    bootstrappedBrief = true;
  }

  const openWork = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, [...OPEN_DELIVERY_STATUSES]),
      ),
    )
    .limit(1);

  let queuedFromReplan = 0;
  if (openWork.length === 0) {
    // Force a replan cycle even if lastVisionReplanAt is recent
    await db
      .update(projects)
      .set({ lastVisionReplanAt: null, updatedAt: new Date() })
      .where(eq(projects.id, input.projectId));
    const replan = await runVisionReplan(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      autoQueue: true,
    });
    queuedFromReplan = replan.queued;
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.autonomous_bootstrap",
    targetType: "project",
    targetId: input.projectId,
    meta: {
      briefId: brief.id,
      bootstrappedBrief,
      queuedFromReplan,
    },
  });

  return { bootstrappedBrief, queuedFromReplan };
}

/**
 * Start — one switch. Arms/resumes arena, turns on min_human + maintainer,
 * bootstraps vision/backlog, continues without human Accept or plan entry.
 */
export async function startProjectArena(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<ArenaControlResult> {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new MaintainerError("not_found", "Project not found");
  }

  // Arm min_human before vision replan so submit auto-queues (no Accept inbox).
  let { arena } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    minHuman: true,
    defaultContenderN: 2,
    contenderCount: 2,
  });

  if (!arena.minHuman) {
    arena = await setArenaMinHuman(db, {
      workspaceId: input.workspaceId,
      arenaId: arena.id,
      minHuman: true,
      actor: input.actor,
    });
  }

  const bootstrap = await ensureAutonomousVisionAndBacklog(db, input);

  if (arena.status === "KILLED" || arena.status === "PAUSED") {
    arena = await resumeArena(db, {
      workspaceId: input.workspaceId,
      arenaId: arena.id,
      actor: input.actor,
    });
  } else if (arena.status !== "RUNNING") {
    const [running] = await db
      .update(arenas)
      .set({ status: "RUNNING", killedAt: null, updatedAt: new Date() })
      .where(eq(arenas.id, arena.id))
      .returning();
    if (running) arena = running;
  }

  let liveProject = project;
  if (!project.maintainerEnabled) {
    const enabled = await enableMaintainerMode(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      policy: {
        autoMerge: true,
        autoRelease: true,
        selfImprove: true,
        autoQueueReplanTasks: true,
        continuousBacklog: true,
      },
    });
    liveProject = enabled.project;
    const refreshed = await getArenaForProject(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    if (refreshed) arena = refreshed;
  }

  // Auto-queue anything sitting in the human inbox
  const awaiting = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, ["READY_FOR_APPROVAL", "DRAFT"]),
      ),
    )
    .limit(20);

  let resumedTasks = 0;
  for (const task of awaiting) {
    try {
      if (task.status === "DRAFT" || task.status === "NEEDS_REPLAN") {
        await submitTaskForApproval(db, {
          workspaceId: input.workspaceId,
          taskId: task.id,
          actor: input.actor,
        });
        resumedTasks += 1;
      } else if (task.status === "READY_FOR_APPROVAL") {
        await approveTask(db, {
          workspaceId: input.workspaceId,
          taskId: task.id,
          actor: input.actor,
        });
        resumedTasks += 1;
      }
    } catch {
      // skip blocked tasks
    }
  }

  // Re-enqueue QUEUED tasks whose runs were cancelled by Stop
  const queued = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.status, "QUEUED"),
      ),
    )
    .limit(20);

  for (const task of queued) {
    const runs = await listRunsForTask(db, input.workspaceId, task.id);
    const active = runs.some((r) =>
      ["QUEUED", "RUNNING", "VALIDATING"].includes(r.status),
    );
    if (active) continue;
    try {
      await enqueueQueuedTask(db, {
        workspaceId: input.workspaceId,
        task,
        actor: input.actor,
        reason: "arena_start_resume",
      });
      resumedTasks += 1;
    } catch {
      // skip
    }
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.start",
    targetType: "arena",
    targetId: arena.id,
    meta: {
      resumedTasks,
      maintainerEnabled: liveProject.maintainerEnabled,
      bootstrappedBrief: bootstrap.bootstrappedBrief,
      queuedFromReplan: bootstrap.queuedFromReplan,
    },
  });
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "tick",
    payload: {
      action: "arena_start",
      resumedTasks,
      bootstrappedBrief: bootstrap.bootstrappedBrief,
      queuedFromReplan: bootstrap.queuedFromReplan,
    },
  });

  return {
    arena,
    project: liveProject,
    resumedTasks,
    maintainerEnabled: liveProject.maintainerEnabled,
    bootstrappedBrief: bootstrap.bootstrappedBrief,
    queuedFromReplan: bootstrap.queuedFromReplan,
  };
}

/**
 * Stop — one switch. Soft-pauses arena; development freezes until Start.
 * REVIEW_REQUIRED / DONE work is kept so Start continues from there.
 */
export async function stopProjectArena(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<ArenaControlResult> {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new MaintainerError("not_found", "Project not found");
  }

  let arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  if (!arena) {
    const ensured = await ensureArenaForProject(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      minHuman: true,
      defaultContenderN: 2,
      contenderCount: 2,
    });
    arena = ensured.arena;
  }

  arena = await pauseArena(db, {
    workspaceId: input.workspaceId,
    arenaId: arena.id,
    actor: input.actor,
  });

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.stop",
    targetType: "arena",
    targetId: arena.id,
    meta: {},
  });
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "tick",
    payload: { action: "arena_stop" },
  });

  return {
    arena,
    project,
    resumedTasks: 0,
    maintainerEnabled: project.maintainerEnabled,
    bootstrappedBrief: false,
    queuedFromReplan: 0,
  };
}

export async function disableMaintainerMode(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<Project> {
  const existing = parseMaintainerPolicy(
    (
      await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1)
    )[0]?.maintainerPolicyJson,
  );
  const policy = { ...existing, enabled: false };
  const [updated] = await db
    .update(projects)
    .set({
      maintainerEnabled: false,
      maintainerPolicyJson: serializeMaintainerPolicy(policy),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!updated) {
    throw new MaintainerError("not_found", "Project not found");
  }
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.disable",
    targetType: "project",
    targetId: input.projectId,
    meta: {},
  });
  return updated;
}

export async function updateMaintainerPolicy(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    patch: Partial<MaintainerPolicy>;
  },
): Promise<{ project: Project; policy: MaintainerPolicy }> {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new MaintainerError("not_found", "Project not found");
  }
  const policy = {
    ...parseMaintainerPolicy(project.maintainerPolicyJson),
    ...input.patch,
  };
  if (typeof input.patch.monthlyBudgetMicros === "number") {
    await setProjectBudget(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      capMicros: policy.monthlyBudgetMicros,
      softAlertMicros: Math.floor(
        policy.monthlyBudgetMicros * policy.softAlertRatio,
      ),
      actor: input.actor,
      period: "monthly",
    });
  }
  const [updated] = await db
    .update(projects)
    .set({
      maintainerEnabled: policy.enabled,
      maintainerPolicyJson: serializeMaintainerPolicy(policy),
      mergeEnabled: policy.autoMerge ? true : project.mergeEnabled,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId))
    .returning();
  if (!updated) {
    throw new MaintainerError("not_found", "Project not found");
  }
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.policy",
    targetType: "project",
    targetId: input.projectId,
    meta: { policy },
  });
  return { project: updated, policy };
}

export async function listMaintainerProjects(
  db: Database,
): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.maintainerEnabled, true));
}

export type MaintainerTickResult = {
  workspaceId: string;
  projectId: string;
  rolledPeriod: boolean;
  autoAccepted: number;
  autoMergedCandidates: Array<{
    taskId: string;
    prNumber: number | null;
    runId: string | null;
  }>;
  armedSignals: number;
  selfImproved: boolean;
  replanned: boolean;
  softAlert: boolean;
  paused: boolean;
  errors: string[];
};

/**
 * One scheduler tick for a maintainer project:
 * period roll → soft/hard budget → triage arm → auto-accept ready reviews →
 * self-improve → vision replan.
 * Auto-merge of GitHub PRs is performed by the worker (needs installation token).
 */
export async function tickMaintainerProject(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor?: string;
  },
): Promise<MaintainerTickResult> {
  const actor = input.actor ?? "system:maintainer";
  const result: MaintainerTickResult = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    rolledPeriod: false,
    autoAccepted: 0,
    autoMergedCandidates: [],
    armedSignals: 0,
    selfImproved: false,
    replanned: false,
    softAlert: false,
    paused: false,
    errors: [],
  };

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
        eq(projects.maintainerEnabled, true),
      ),
    )
    .limit(1);
  if (!project) {
    result.errors.push("project not maintainer-enabled");
    return result;
  }

  const [arena] = await db
    .select()
    .from(arenas)
    .where(eq(arenas.projectId, input.projectId))
    .limit(1);
  if (arena?.status === "KILLED") {
    result.errors.push("arena killed");
    result.paused = true;
    return result;
  }

  const policy = parseMaintainerPolicy(project.maintainerPolicyJson);

  try {
    const rolled = await rollMonthlyBudgetIfDue(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor,
    });
    result.rolledPeriod = rolled.rolled;
    if (rolled.rolled) {
      await recordMaintainerEvent(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: "period_roll",
        payload: {},
      });
    }
  } catch (err) {
    result.errors.push(
      `period_roll: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let spend;
  try {
    spend = await getProjectSpendSummary(
      db,
      input.workspaceId,
      input.projectId,
    );
  } catch (err) {
    result.errors.push(
      `spend: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  if (spend.budgetStatus === "paused") {
    result.paused = true;
    return result;
  }

  const softAt = Math.floor(spend.capMicros * policy.softAlertRatio);
  if (spend.spentMicros >= softAt && softAt > 0) {
    result.softAlert = true;
  }
  if (spend.availableMicros <= 0) {
    await db
      .update(budgets)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(budgets.projectId, input.projectId));
    result.paused = true;
    await recordMaintainerEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "tick",
      payload: { action: "hard_pause", spentMicros: spend.spentMicros },
    });
    return result;
  }

  // User Stop freezes the loop; budget exhaustion only pauses the ledger above.
  // Arena stays RUNNING under a hard budget pause so a monthly roll (budget
  // reactivated) continues shipping without another Start.
  if (arena?.status === "PAUSED") {
    result.errors.push("arena paused");
    result.paused = true;
    return result;
  }

  // Drain human inbox in the background (min_human): DRAFT → queue, approve → queue
  if (arena?.minHuman) {
    try {
      const awaiting = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            eq(tasks.workspaceId, input.workspaceId),
            inArray(tasks.status, ["DRAFT", "READY_FOR_APPROVAL"]),
          ),
        )
        .limit(20);
      for (const task of awaiting) {
        try {
          if (task.status === "DRAFT") {
            await submitTaskForApproval(db, {
              workspaceId: input.workspaceId,
              taskId: task.id,
              actor,
            });
          } else if (task.status === "READY_FOR_APPROVAL") {
            await approveTask(db, {
              workspaceId: input.workspaceId,
              taskId: task.id,
              actor,
            });
          }
        } catch {
          // skip blocked
        }
      }
    } catch (err) {
      result.errors.push(
        `inbox_drain: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Triage: arm received signals under policy + residual budget
  try {
    const signals = await listSignalEvents(db, input.workspaceId, {
      status: "received",
      limit: 20,
    });
    for (const sig of signals) {
      if (sig.projectId && sig.projectId !== input.projectId) continue;
      const allowed =
        policy.allowedSignalProviders.includes("*") ||
        policy.allowedSignalProviders.includes(sig.provider);
      if (!allowed) continue;
      try {
        await armSignalEvent(db, {
          workspaceId: input.workspaceId,
          signalId: sig.id,
          actor,
          projectId: input.projectId,
        });
        result.armedSignals += 1;
        await recordMaintainerEvent(db, {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          kind: "triage",
          payload: { signalEventId: sig.id, provider: sig.provider },
        });
      } catch {
        // skip non-armable
      }
      if (result.armedSignals >= 3) break;
    }
  } catch (err) {
    result.errors.push(
      `triage: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Auto-accept REVIEW_REQUIRED when CI green AND tournament WINNER (or solo)
  if (policy.autoMerge) {
    try {
      const pending = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            eq(tasks.workspaceId, input.workspaceId),
            eq(tasks.status, "REVIEW_REQUIRED"),
          ),
        )
        .limit(20);

      for (const task of pending) {
        // Never auto-accept imported PR review tasks
        if (task.githubPrNumber != null) continue;
        if (
          !taskMatchesPathAllowlist(task.allowedPaths, policy.pathAllowlist)
        ) {
          continue;
        }
        const runs = await listRunsForTask(db, input.workspaceId, task.id);
        const candidate = selectAutoAcceptRun(runs);
        if (!candidate) continue;
        const fitness = await getRunCiFitness(db, candidate.id);
        if (!fitness.acceptReady) continue;

        try {
          await decideTaskReview(db, {
            workspaceId: input.workspaceId,
            taskId: task.id,
            actor,
            decision: "accept",
            note: "maintainer auto-accept (winner + CI green)",
          });
          result.autoAccepted += 1;
          result.autoMergedCandidates.push({
            taskId: task.id,
            prNumber: candidate.prNumber ?? null,
            runId: candidate.id,
          });
          await recordMaintainerEvent(db, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            kind: "auto_accept",
            payload: {
              taskId: task.id,
              runId: candidate.id,
              prNumber: candidate.prNumber,
              tournamentResult: candidate.tournamentResult,
            },
          });
        } catch (err) {
          result.errors.push(
            `auto_accept ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      result.errors.push(
        `auto_accept: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Self-improve: evolve a workspace profile from recent winner runs
  if (policy.selfImprove && spend.availableMicros > 50_000) {
    try {
      const improved = await maybeSelfImproveProfile(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actor,
      });
      result.selfImproved = improved;
    } catch (err) {
      result.errors.push(
        `self_improve: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Vision replan — continuous backlog refills when the board is idle under budget
  const openRows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, [...OPEN_DELIVERY_STATUSES]),
      ),
    )
    .limit(50);
  const due = shouldReplanVision({
    lastVisionReplanAt: project.lastVisionReplanAt,
    replanIntervalDays: policy.replanIntervalDays,
    continuousBacklog: policy.continuousBacklog,
    openWorkCount: openRows.length,
    availableMicros: spend.availableMicros,
  });
  if (due) {
    try {
      await runVisionReplan(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actor,
      });
      result.replanned = true;
    } catch (err) {
      result.errors.push(
        `replan: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await db
    .update(projects)
    .set({ lastMaintainerTickAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, input.projectId));

  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "tick",
    payload: {
      autoAccepted: result.autoAccepted,
      armedSignals: result.armedSignals,
      selfImproved: result.selfImproved,
      replanned: result.replanned,
      softAlert: result.softAlert,
      availableMicros: spend.availableMicros,
    },
  });

  return result;
}

/** Tick all maintainer-enabled projects (worker entry). */
export async function tickAllMaintainerProjects(
  db: Database,
  actor = "system:maintainer",
): Promise<MaintainerTickResult[]> {
  const rows = await listMaintainerProjects(db);
  const out: MaintainerTickResult[] = [];
  for (const p of rows) {
    out.push(
      await tickMaintainerProject(db, {
        workspaceId: p.workspaceId,
        projectId: p.id,
        actor,
      }),
    );
  }
  return out;
}

/** Pick a bounded challenger role distinct from the champion for meta-tournaments. */
export function pickMetaTournamentChallenger(
  championKey: string,
): string {
  const key = BOUNDED_KEYS.has(championKey) ? championKey : "engineer";
  if (key === "engineer") return "reviewer";
  if (key === "reviewer") return "engineer";
  if (key === "proposer") return "engineer";
  if (key === "fixer") return "qa";
  if (key === "qa") return "fixer";
  return "engineer";
}

/**
 * Fitness gate: rollback when recent winner efficiency falls below the
 * efficiency that justified the last self_improve evolution.
 */
export function shouldRollbackProfileForFitness(input: {
  recentWinnerEfficiencies: number[];
  lastEvolveAvgEfficiency: number | null;
  minSamples?: number;
  dropRatio?: number;
}): boolean {
  const minSamples = input.minSamples ?? 2;
  const dropRatio = input.dropRatio ?? 0.7;
  const samples = input.recentWinnerEfficiencies.filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  if (samples.length < minSamples) return false;
  if (
    input.lastEvolveAvgEfficiency == null ||
    input.lastEvolveAvgEfficiency <= 0
  ) {
    return false;
  }
  const avg =
    samples.reduce((s, n) => s + n, 0) / samples.length;
  return avg < input.lastEvolveAvgEfficiency * dropRatio;
}

/**
 * Evolve workspace AgentProfile from winners; also arm a bounded
 * meta-tournament (champion vs challenger roles) on the project arena.
 */
export async function maybeSelfImproveProfile(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<boolean> {
  const winners = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.projectId, input.projectId),
        eq(agentRuns.tournamentResult, "WINNER"),
      ),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(5);

  if (winners.length < 2) return false;

  const rawKey = winners[0]?.agentProfileKey ?? "engineer";
  const profileKey = BOUNDED_KEYS.has(rawKey) ? rawKey : "engineer";
  const [profile] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.workspaceId, input.workspaceId),
        eq(agentProfiles.key, profileKey),
      ),
    )
    .limit(1);

  // Prefer workspace override; if only system seed, clone into workspace
  let base: AgentProfile | undefined = profile;
  if (!base) {
    const [sys] = await db
      .select()
      .from(agentProfiles)
      .where(
        and(
          sql`${agentProfiles.workspaceId} is null`,
          eq(agentProfiles.key, profileKey),
        ),
      )
      .limit(1);
    if (!sys) return false;
    const [cloned] = await db
      .insert(agentProfiles)
      .values({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        key: sys.key,
        displayName: sys.displayName,
        promptGuidance: sys.promptGuidance,
        toolAllowlistJson: sys.toolAllowlistJson,
        strategyDefault: sys.strategyDefault,
        maxSpendMicros: sys.maxSpendMicros,
        locked: false,
        version: 1,
        parentProfileId: sys.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    base = cloned;
  }
  if (!base || base.locked) return false;

  const avgEfficiency =
    winners.reduce((s, r) => s + (r.efficiencyScore ?? 0), 0) / winners.length;
  if (avgEfficiency <= 0) return false;

  // Fitness gate: auto-rollback if evolution hurt recent winner efficiency
  const priorImprove = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, input.projectId),
        eq(maintainerEvents.kind, "self_improve"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(1);
  let lastEvolveAvg: number | null = null;
  if (priorImprove[0]) {
    try {
      const payload = JSON.parse(priorImprove[0].payload) as {
        avgEfficiency?: number;
      };
      lastEvolveAvg =
        typeof payload.avgEfficiency === "number"
          ? payload.avgEfficiency
          : null;
    } catch {
      lastEvolveAvg = null;
    }
  }
  if (
    shouldRollbackProfileForFitness({
      recentWinnerEfficiencies: winners.map((r) => r.efficiencyScore ?? 0),
      lastEvolveAvgEfficiency: lastEvolveAvg,
    }) &&
    base.parentProfileId
  ) {
    await rollbackProfileEvolution(db, {
      workspaceId: input.workspaceId,
      profileId: base.id,
      actor: input.actor,
    });
    await recordMaintainerEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "self_improve",
      payload: {
        action: "fitness_rollback",
        profileId: base.id,
        key: base.key,
        avgEfficiency,
        lastEvolveAvg,
      },
    });
    return true;
  }

  let changed = false;
  const tip =
    " Prefer minimal diffs, deterministic tests, and stay within path allowlist. Cut spend when fitness is already high.";
  if (!base.promptGuidance.includes("Prefer minimal diffs")) {
    const nextGuidance = `${base.promptGuidance.trim()}${tip}`.slice(0, 4000);
    const [evolved] = await db
      .update(agentProfiles)
      .set({
        promptGuidance: nextGuidance,
        version: (base.version ?? 1) + 1,
        parentProfileId: base.id,
        evolvedFromRunId: winners[0]?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(agentProfiles.id, base.id))
      .returning();

    if (evolved) {
      changed = true;
      await recordMaintainerEvent(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: "self_improve",
        payload: {
          profileId: evolved.id,
          key: evolved.key,
          version: evolved.version,
          avgEfficiency,
        },
      });
      await recordAuditEvent(db, {
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "maintainer.self_improve",
        targetType: "agent_profile",
        targetId: evolved.id,
        meta: { version: evolved.version, key: evolved.key },
      });
      base = evolved;
    }
  }

  // Meta-tournament: champion vs bounded challenger on the project arena
  if (winners.length >= 3) {
    const challengerKey = pickMetaTournamentChallenger(base.key);
    const recentMeta = await db
      .select()
      .from(maintainerEvents)
      .where(
        and(
          eq(maintainerEvents.projectId, input.projectId),
          eq(maintainerEvents.kind, "meta_tournament"),
        ),
      )
      .orderBy(desc(maintainerEvents.createdAt))
      .limit(1);
    let alreadyArmed = false;
    if (recentMeta[0]) {
      try {
        const p = JSON.parse(recentMeta[0].payload) as {
          championKey?: string;
          challengerKey?: string;
        };
        alreadyArmed =
          p.championKey === base.key && p.challengerKey === challengerKey;
      } catch {
        alreadyArmed = false;
      }
    }
    if (!alreadyArmed) {
      const flip =
        base.strategyDefault === "blitz"
          ? "fortress"
          : base.strategyDefault === "fortress"
            ? "blitz"
            : "fortress";
      await applySpawnProfilesToArena(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actor: input.actor,
        profileKeys: [base.key, challengerKey],
      });
      changed = true;
      await recordMaintainerEvent(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: "meta_tournament",
        payload: {
          championKey: base.key,
          challengerKey,
          challengerStrategy: flip,
          avgEfficiency,
        },
      });
      await recordAuditEvent(db, {
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "maintainer.meta_tournament",
        targetType: "project",
        targetId: input.projectId,
        meta: {
          championKey: base.key,
          challengerKey,
          challengerStrategy: flip,
        },
      });
    }
  }

  return changed;
}

/** Rollback profile to parent version guidance if present. */
export async function rollbackProfileEvolution(
  db: Database,
  input: {
    workspaceId: string;
    profileId: string;
    actor: string;
  },
): Promise<AgentProfile> {
  const [profile] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.id, input.profileId),
        eq(agentProfiles.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!profile) {
    throw new MaintainerError("not_found", "Profile not found");
  }
  if (!profile.parentProfileId) {
    throw new MaintainerError("invalid", "No parent profile to rollback to");
  }
  const [parent] = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.id, profile.parentProfileId))
    .limit(1);
  if (!parent) {
    throw new MaintainerError("not_found", "Parent profile missing");
  }
  const [updated] = await db
    .update(agentProfiles)
    .set({
      promptGuidance: parent.promptGuidance,
      strategyDefault: parent.strategyDefault,
      version: Math.max(1, (profile.version ?? 1) - 1),
      updatedAt: new Date(),
    })
    .where(eq(agentProfiles.id, profile.id))
    .returning();
  if (!updated) {
    throw new MaintainerError("not_found", "Rollback failed");
  }
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.profile_rollback",
    targetType: "agent_profile",
    targetId: profile.id,
    meta: { parentProfileId: parent.id },
  });
  return updated;
}

/**
 * Vision-driven replan: append a small cycle milestone from the approved brief,
 * activate it, and auto-queue root DRAFT tasks (propose → queue).
 */
export async function runVisionReplan(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    /** Override policy auto-queue (default: from project maintainer policy). */
    autoQueue?: boolean;
    maxAutoQueue?: number;
  },
): Promise<{ taskCount: number; queued: number }> {
  const brief = await getLatestBriefForProject(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!brief || brief.status !== "approved") {
    throw new MaintainerError("invalid", "Approved vision brief required");
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  const policy = parseMaintainerPolicy(project?.maintainerPolicyJson);
  const autoQueue =
    input.autoQueue ?? policy.autoQueueReplanTasks;
  const maxAutoQueue =
    input.maxAutoQueue ?? policy.maxAutoQueuePerReplan;

  const stamp = new Date().toISOString().slice(0, 10);
  const plan = await generateProjectPlan(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    milestones: [
      {
        title: `Maintainer cycle ${stamp}`,
        description: `Autonomous replan from vision: ${brief.title}`,
        tasks: [
          {
            key: `m-${stamp}-propose`,
            title: "Propose next scoped improvement",
            goal: `From vision, pick one tiny improvement: ${brief.problem.slice(0, 200)}`,
            scope:
              brief.scope.slice(0, 500) ||
              "One file / one package; prefer bugs and docs over large features",
            allowedPaths: ["**/*"],
            acceptanceCriteria: [
              "Scoped proposal implemented as a reviewable PR or explicit noop",
              "Stay within monthly budget",
            ],
            estimateMicros: 80_000,
            estimateComplexity: "S" as const,
            dependsOn: [],
            priority: 10,
          },
          {
            key: `m-${stamp}-ship`,
            title: "Ship highest-ROI fix or feature",
            goal: `Advance acceptance: ${(brief.acceptanceCriteria || "").slice(0, 200)}`,
            scope:
              "One small deliverable; prefer bugs/CI over large features under micro-budget",
            allowedPaths: ["**/*"],
            acceptanceCriteria: [
              "CI green on primary",
              "PR merged under maintainer policy",
            ],
            estimateMicros: 120_000,
            estimateComplexity: "S" as const,
            dependsOn: [`m-${stamp}-propose`],
            priority: 20,
          },
        ],
      },
    ],
  });

  // Activate milestones so the board leaves draft/setup posture
  for (const m of plan.milestones) {
    await db
      .update(milestones)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(milestones.id, m.milestone.id));
  }

  // Arm proposer/engineer contenders for the autonomous backlog cycle
  try {
    await applySpawnProfilesToArena(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      profileKeys: ["proposer", "engineer"],
    });
  } catch {
    // arena may not exist yet — tick/enable creates it
  }

  let queued = 0;
  if (autoQueue) {
    for (const m of plan.milestones) {
      for (const tv of m.tasks) {
        if (queued >= maxAutoQueue) break;
        // Only root tasks (no deps) — dependents wait for later ticks / human
        if ((tv.dependsOnTaskIds?.length ?? 0) > 0) continue;
        if (tv.task.status !== "DRAFT") continue;
        try {
          await submitTaskForApproval(db, {
            workspaceId: input.workspaceId,
            taskId: tv.task.id,
            actor: input.actor,
          });
          queued += 1;
        } catch (err) {
          // keep going — surface via audit
          await recordAuditEvent(db, {
            workspaceId: input.workspaceId,
            actor: input.actor,
            action: "maintainer.replan_queue_failed",
            targetType: "task",
            targetId: tv.task.id,
            meta: {
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }
  }

  await db
    .update(projects)
    .set({ lastVisionReplanAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, input.projectId));

  const taskCount = plan.milestones.reduce(
    (n, m) => n + (m.tasks?.length ?? 0),
    0,
  );

  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "replan",
    payload: { briefId: brief.id, taskCount, queued, autoQueue },
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.replan",
    targetType: "project",
    targetId: input.projectId,
    meta: { briefId: brief.id, taskCount, queued },
  });

  return { taskCount, queued };
}

export type MaintainerMetrics = {
  projectId: string;
  workspaceId: string;
  windowDays: number;
  merges: number;
  spendMicros: number;
  capMicros: number;
  spendWithinCap: boolean;
  humanTouches: number;
  policyViolations: number;
  autoAccepts: number;
  selfImproves: number;
  metaTournaments: number;
  replans: number;
  /** micros / accepted merge (0 when no merges). */
  costPerAcceptedMergeMicros: number;
  /** Distinct winning profile keys in the window. */
  winningProfileKeys: string[];
  ticks: number;
  maintainerEnabled: boolean;
};

export async function getMaintainerMetrics(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    days?: number;
  },
): Promise<MaintainerMetrics> {
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new MaintainerError("not_found", "Project not found");
  }

  const spend = await getProjectSpendSummary(
    db,
    input.workspaceId,
    input.projectId,
  );

  const doneTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        inArray(tasks.status, ["ACCEPTED", "DONE"]),
        gte(tasks.updatedAt, since),
        sql`${tasks.prUrl} is not null`,
      ),
    );

  const humanAudits = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, input.workspaceId),
        eq(auditEvents.targetId, input.projectId),
        gte(auditEvents.createdAt, since),
        sql`${auditEvents.actor} not like 'system:%'`,
        sql`${auditEvents.actor} not like 'script:%'`,
        inArray(auditEvents.action, [
          "task.review.accept",
          "task.review.reject",
          "merge.attempt",
        ]),
      ),
    );

  const events = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, input.projectId),
        gte(maintainerEvents.createdAt, since),
      ),
    );

  const autoAccepts = events.filter((e) => e.kind === "auto_accept").length;
  const selfImproves = events.filter((e) => e.kind === "self_improve").length;
  const metaTournaments = events.filter(
    (e) => e.kind === "meta_tournament",
  ).length;
  const replans = events.filter((e) => e.kind === "replan").length;
  const ticks = events.filter((e) => e.kind === "tick").length;
  const policyViolations = events.filter(
    (e) => e.kind === "tick" && e.payload.includes("policy_violation"),
  ).length;

  const winnerRuns = await db
    .select({ key: agentRuns.agentProfileKey })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.projectId, input.projectId),
        eq(agentRuns.tournamentResult, "WINNER"),
        gte(agentRuns.createdAt, since),
      ),
    );
  const winningProfileKeys = [
    ...new Set(winnerRuns.map((r) => r.key).filter(Boolean)),
  ].sort();

  const merges = doneTasks.length;
  return {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    windowDays: days,
    merges,
    spendMicros: spend.spentMicros,
    capMicros: spend.capMicros,
    spendWithinCap: spend.spentMicros <= spend.capMicros,
    humanTouches: humanAudits.length,
    policyViolations,
    autoAccepts,
    selfImproves,
    metaTournaments,
    replans,
    costPerAcceptedMergeMicros:
      merges > 0 ? Math.round(spend.spentMicros / merges) : 0,
    winningProfileKeys,
    ticks,
    maintainerEnabled: project.maintainerEnabled,
  };
}

export async function getWorkspaceMaintainerRollup(
  db: Database,
  input: { workspaceId: string; days?: number },
): Promise<{
  projects: MaintainerMetrics[];
  totals: {
    merges: number;
    spendMicros: number;
    humanTouches: number;
    maintainerProjectCount: number;
  };
}> {
  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, input.workspaceId),
        eq(projects.maintainerEnabled, true),
      ),
    );
  const projectsMetrics: MaintainerMetrics[] = [];
  for (const p of rows) {
    projectsMetrics.push(
      await getMaintainerMetrics(db, {
        workspaceId: input.workspaceId,
        projectId: p.id,
        days: input.days,
      }),
    );
  }
  return {
    projects: projectsMetrics,
    totals: {
      merges: projectsMetrics.reduce((s, m) => s + m.merges, 0),
      spendMicros: projectsMetrics.reduce((s, m) => s + m.spendMicros, 0),
      humanTouches: projectsMetrics.reduce((s, m) => s + m.humanTouches, 0),
      maintainerProjectCount: projectsMetrics.length,
    },
  };
}

/** Tasks that still need GitHub merge after auto-accept (worker). */
export async function listAutoMergeCandidates(
  db: Database,
  projectId: string,
): Promise<Array<{ task: Task; prNumber: number; runId: string }>> {
  const recent = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, projectId),
        eq(maintainerEvents.kind, "auto_accept"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(20);

  const out: Array<{ task: Task; prNumber: number; runId: string }> = [];
  for (const ev of recent) {
    let payload: { taskId?: string; prNumber?: number; runId?: string } = {};
    try {
      payload = JSON.parse(ev.payload) as typeof payload;
    } catch {
      continue;
    }
    if (!payload.taskId || !payload.prNumber || !payload.runId) continue;
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, payload.taskId))
      .limit(1);
    if (!task || task.status !== "DONE") continue;
    out.push({
      task,
      prNumber: payload.prNumber,
      runId: payload.runId,
    });
  }
  return out;
}

export async function markAutoMerged(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    prNumber: number;
    merged: boolean;
    message: string;
  },
): Promise<void> {
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "auto_merge",
    payload: {
      taskId: input.taskId,
      prNumber: input.prNumber,
      merged: input.merged,
      message: input.message,
    },
  });
}
