import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { expireStaleTaskApprovals } from "./approvals.js";
import {
  approveBrief,
  createBriefDraft,
  getLatestBriefForProject,
  recordAuditEvent,
} from "./briefs.js";
import {
  getProjectSpendSummary,
  getWorkspaceBudgetRow,
  getWorkspaceSpendSummary,
  rollMonthlyBudgetIfDue,
  setWorkspaceBudget,
} from "./budgets.js";
import {
  sanitizePolicyForMaintainerEnable,
  shouldInitWorkspaceBudgetOnEnable,
} from "./maintainer-enable-guard.js";
import { getRunCiFitness } from "./ci-evidence.js";
import { setProjectAutonomyLevel, setProjectMergeEnabled } from "./project-policy.js";
import {
  ensureArenaForProject,
  ensureContenderEnqueueBudget,
  getArenaForProject,
  MIN_DUEL_CONTENDERS,
  pauseArena,
  resumeArena,
  setArenaMinHuman,
} from "./arena.js";
import { flipContenderStrategy } from "./contender-peers.js";
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
  applyTaskTransition,
  approveTask,
  decideTaskReview,
  enqueueQueuedTask,
  predecessorsAreDone,
  submitTaskForApproval,
} from "./task-transitions.js";
import { listRunsForTask } from "./runs.js";
import { armSignalEvent, listSignalEvents } from "./signals.js";
import { generateProjectPlan } from "./plans.js";
import {
  architectureIdsFromTitles,
  extractArchitectureIdFromTitle,
  parseArchitectureOpenTasks,
  pickNextArchitectureTask,
} from "./architecture-backlog.js";
import { getProjectForWorkspace } from "./projects.js";
import { openTaskCountsAsBusyForBacklog } from "./ship-gate-heal-policy.js";
import { fetchArchitectureBacklogMarkdown } from "./architecture-program-fetch.js";

export {
  DEFAULT_ARCHITECTURE_PATHS,
  fetchArchitectureBacklogMarkdown,
} from "./architecture-program-fetch.js";

/** Soft buffer under a typical OpenAI org $10/mo hard cap (BYOK dogfood). */
export const DEFAULT_MONTHLY_BUDGET_MICROS = 8_000_000;

/**
 * Archive / non-product projects must never invent architecture Open IDs
 * (primary-only writes until coordinatedMultiRepo is on).
 */
export const ARCHIVE_OR_NON_PRODUCT_PROJECT_NAMES = new Set([
  ".github",
  "homebrew-tap",
  "kprompt-examples",
  "kprompt-architecture",
  "coppergate-examples",
  "coppergate-staging-smoke",
  "coppergate-architecture",
]);

/** Default task allowedPaths when inventing against a TS monorepo / product path policy. */
export const DEFAULT_PRODUCT_ALLOWED_PATHS = [
  "apps/**",
  "packages/**",
  "docs/**",
  "scripts/**",
  "*.md",
  ".github/**",
];

/** How long a DONE/FAILED architecture ID stays excluded from re-invent (thrash guard). */
export const ARCHITECTURE_ID_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** Below this available project budget, skip meta-tournament arming (spend guard). */
export const LEAN_ROSTER_AVAILABLE_MICROS = 2_000_000;

/**
 * Minimal spend-safe arena roster — peer seats of engineer only.
 * Reviewer remains a catalog profile (critic/review path), not a duel seat.
 */
export const LEAN_ARENA_PROFILE_KEYS = ["engineer"] as const;

/**
 * Arena seating keys from remaining project micros.
 * Always peer-primary engineer — FULL_ARENA_PROFILE_KEYS is spawn catalog only.
 */
export function rosterKeysForAvailableBudget(
  _availableMicros: number,
): string[] {
  return [...LEAN_ARENA_PROFILE_KEYS];
}

/**
 * Fail-closed when the LLM provider reports billing/quota exhaustion.
 * Pauses the project arena so claims stop burning the last dollars.
 */
export async function pauseArenaForProviderQuota(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    detail?: string;
  },
): Promise<{ paused: boolean; arenaId: string | null }> {
  const arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  if (!arena) {
    return { paused: false, arenaId: null };
  }
  if (arena.status !== "PAUSED") {
    await pauseArena(db, {
      workspaceId: input.workspaceId,
      arenaId: arena.id,
      actor: input.actor,
    });
  }
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "provider_quota",
    payload: {
      arenaId: arena.id,
      detail: input.detail?.slice(0, 400) ?? null,
    },
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.pause_provider_quota",
    targetType: "project",
    targetId: input.projectId,
    meta: {
      arenaId: arena.id,
      detail: input.detail?.slice(0, 400) ?? null,
    },
  });
  return { paused: true, arenaId: arena.id };
}

export type MaintainerPolicy = {
  enabled: boolean;
  monthlyBudgetMicros: number;
  softAlertRatio: number;
  autoMerge: boolean;
  autoRelease: boolean;
  selfImprove: boolean;
  communityReplies: boolean;
  /** Periodically open good-first-issue GitHub issues for community (not imported). */
  communityScout: boolean;
  communityScoutIntervalHours: number;
  communityScoutMaxPerRun: number;
  communityScoutMaxOpenGoodFirst: number;
  /**
   * After scout creates issues, auto-import up to N into the primary board
   * (DRAFT → submit). 0 = create-only (legacy).
   */
  communityScoutAutoImportMax: number;
  /**
   * Periodically screenshot target URLs and open design/ux GitHub issues
   * (metric-driven; Playwright capture in worker).
   */
  designScout: boolean;
  designScoutIntervalHours: number;
  designScoutMaxPerRun: number;
  /** Override capture base URL (e.g. https://www.coppergate.ai). */
  designScoutBaseUrl: string | null;
  /**
   * After design scout creates issues, auto-import up to N (0 = create-only).
   */
  designScoutAutoImportMax: number;
  /** When true, open a revert PR if a recent auto-merge's checks go red. */
  shipRollbackOnCiFail: boolean;
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
  /** Override ARCHITECTURE_REPO for this project (owner/name). */
  architectureRepo: string | null;
  /** Override ARCHITECTURE_PATHS (comma-separated) for this project. */
  architecturePaths: string | null;
};

export const DEFAULT_MAINTAINER_POLICY: MaintainerPolicy = {
  enabled: true,
  monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS,
  softAlertRatio: 0.8,
  autoMerge: true,
  /** P-144: GitHub tag + Release only when explicitly enabled — not prod deploy. */
  autoRelease: false,
  selfImprove: true,
  communityReplies: true,
  communityScout: true,
  communityScoutIntervalHours: 8,
  communityScoutMaxPerRun: 2,
  communityScoutMaxOpenGoodFirst: 5,
  communityScoutAutoImportMax: 1,
  designScout: false,
  designScoutIntervalHours: 24,
  designScoutMaxPerRun: 2,
  designScoutBaseUrl: null,
  designScoutAutoImportMax: 0,
  shipRollbackOnCiFail: true,
  coordinatedMultiRepo: false,
  allowedSignalProviders: [
    "*",
    "ci_failure",
    "merge_conflict",
    "stale_delivery",
    "sentry",
    "dependabot",
    "codeql",
  ],
  pathAllowlist: [],
  /** Self-pilot default fan-out width (1). Raise to 2 for Community duel. */
  maxTournamentN: 1,
  visionBriefId: null,
  replanIntervalDays: 7,
  autoQueueReplanTasks: true,
  maxAutoQueuePerReplan: 2,
  continuousBacklog: true,
  releaseTagStyle: "daily",
  architectureRepo: null,
  architecturePaths: null,
};

/** Open delivery statuses that keep the autonomous board "busy". */
const OPEN_DELIVERY_STATUSES = [
  "DRAFT",
  "READY_FOR_APPROVAL",
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
  "REVIEW_REQUIRED",
  "BLOCKED",
] as const;

/** Statuses that mean an architecture ID is already in flight on the board. */
const IN_FLIGHT_ARCH_TASK_STATUSES = [
  ...OPEN_DELIVERY_STATUSES,
  "ACCEPTED",
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
      autoMerge:
        typeof v.autoMerge === "boolean"
          ? v.autoMerge
          : DEFAULT_MAINTAINER_POLICY.autoMerge,
      autoRelease:
        typeof v.autoRelease === "boolean"
          ? v.autoRelease
          : DEFAULT_MAINTAINER_POLICY.autoRelease,
      allowedSignalProviders: Array.isArray(v.allowedSignalProviders)
        ? v.allowedSignalProviders.filter((x) => typeof x === "string")
        : DEFAULT_MAINTAINER_POLICY.allowedSignalProviders,
      pathAllowlist: Array.isArray(v.pathAllowlist)
        ? v.pathAllowlist.filter((x) => typeof x === "string")
        : [],
      maxTournamentN:
        typeof v.maxTournamentN === "number" && v.maxTournamentN >= 1
          ? Math.min(3, Math.floor(v.maxTournamentN))
          : DEFAULT_MAINTAINER_POLICY.maxTournamentN,
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
      communityScout:
        typeof v.communityScout === "boolean"
          ? v.communityScout
          : DEFAULT_MAINTAINER_POLICY.communityScout,
      communityScoutIntervalHours:
        typeof v.communityScoutIntervalHours === "number" &&
        v.communityScoutIntervalHours >= 1
          ? Math.min(168, Math.floor(v.communityScoutIntervalHours))
          : DEFAULT_MAINTAINER_POLICY.communityScoutIntervalHours,
      communityScoutMaxPerRun:
        typeof v.communityScoutMaxPerRun === "number" &&
        v.communityScoutMaxPerRun >= 0
          ? Math.min(5, Math.floor(v.communityScoutMaxPerRun))
          : DEFAULT_MAINTAINER_POLICY.communityScoutMaxPerRun,
      communityScoutMaxOpenGoodFirst:
        typeof v.communityScoutMaxOpenGoodFirst === "number" &&
        v.communityScoutMaxOpenGoodFirst >= 0
          ? Math.min(20, Math.floor(v.communityScoutMaxOpenGoodFirst))
          : DEFAULT_MAINTAINER_POLICY.communityScoutMaxOpenGoodFirst,
      communityScoutAutoImportMax:
        typeof v.communityScoutAutoImportMax === "number" &&
        v.communityScoutAutoImportMax >= 0
          ? Math.min(5, Math.floor(v.communityScoutAutoImportMax))
          : DEFAULT_MAINTAINER_POLICY.communityScoutAutoImportMax,
      designScout:
        typeof v.designScout === "boolean"
          ? v.designScout
          : DEFAULT_MAINTAINER_POLICY.designScout,
      designScoutIntervalHours:
        typeof v.designScoutIntervalHours === "number" &&
        v.designScoutIntervalHours >= 1
          ? Math.min(168, Math.floor(v.designScoutIntervalHours))
          : DEFAULT_MAINTAINER_POLICY.designScoutIntervalHours,
      designScoutMaxPerRun:
        typeof v.designScoutMaxPerRun === "number" &&
        v.designScoutMaxPerRun >= 0
          ? Math.min(5, Math.floor(v.designScoutMaxPerRun))
          : DEFAULT_MAINTAINER_POLICY.designScoutMaxPerRun,
      designScoutBaseUrl:
        typeof v.designScoutBaseUrl === "string" &&
        /^https?:\/\/[^\s]+$/i.test(v.designScoutBaseUrl.trim())
          ? v.designScoutBaseUrl.trim().replace(/\/$/, "")
          : DEFAULT_MAINTAINER_POLICY.designScoutBaseUrl,
      designScoutAutoImportMax:
        typeof v.designScoutAutoImportMax === "number" &&
        v.designScoutAutoImportMax >= 0
          ? Math.min(5, Math.floor(v.designScoutAutoImportMax))
          : DEFAULT_MAINTAINER_POLICY.designScoutAutoImportMax,
      shipRollbackOnCiFail:
        typeof v.shipRollbackOnCiFail === "boolean"
          ? v.shipRollbackOnCiFail
          : DEFAULT_MAINTAINER_POLICY.shipRollbackOnCiFail,
      releaseTagStyle:
        v.releaseTagStyle === "semver_patch" ? "semver_patch" : "daily",
      architectureRepo:
        typeof v.architectureRepo === "string" &&
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.architectureRepo.trim())
          ? v.architectureRepo.trim()
          : DEFAULT_MAINTAINER_POLICY.architectureRepo,
      architecturePaths:
        typeof v.architecturePaths === "string" &&
        v.architecturePaths.trim().length > 0
          ? v.architecturePaths.trim().slice(0, 500)
          : DEFAULT_MAINTAINER_POLICY.architecturePaths,
    };
  } catch {
    return { ...DEFAULT_MAINTAINER_POLICY, enabled: false };
  }
}

/**
 * Pick the run eligible for maintainer auto-accept.
 * Tournament tasks require an explicit WINNER — unless every peer shares the
 * same delivery (one PR / one headSha), which is multi-profile fan-out, not a
 * competing duel. Those are treated as solo so unattended auto-accept works.
 */
export function selectAutoAcceptRun<
  T extends {
    tournamentId: string | null;
    tournamentResult: string | null;
    status?: string | null;
    prNumber?: number | null;
    headSha?: string | null;
  },
>(runs: T[]): T | null {
  if (runs.length === 0) return null;
  const winner = runs.find((r) => r.tournamentResult === "WINNER");
  if (winner) return winner;
  const inTournament = runs.some((r) => r.tournamentId != null);
  if (!inTournament) return runs[0] ?? null;

  const prNums = [
    ...new Set(
      runs
        .map((r) => r.prNumber)
        .filter((n): n is number => typeof n === "number" && n > 0),
    ),
  ];
  const shas = [
    ...new Set(
      runs
        .map((r) => r.headSha?.trim())
        .filter((s): s is string => Boolean(s) && s !== "unknown"),
    ),
  ];
  const sameDelivery =
    prNums.length === 1 || (prNums.length === 0 && shas.length === 1);
  if (!sameDelivery) return null;

  const review = runs.find((r) => r.status === "REVIEW_REQUIRED");
  return review ?? runs[0] ?? null;
}

/**
 * Pick a run to poll live GitHub CI for — must work BEFORE tournament WINNER
 * exists. Unresolved tournaments stay WAITING_CI until CI promotes them; if we
 * only refresh winners, dogfood N=1 deadlocks (no CI → no WINNER → no CI).
 */
export function selectCiRefreshRun<
  T extends {
    status: string;
    tournamentId: string | null;
    tournamentResult: string | null;
    headSha: string | null;
  },
>(runs: T[]): T | null {
  const withSha = (r: T) =>
    Boolean(r.headSha && r.headSha !== "unknown" && r.headSha.length > 0);
  const awaiting = runs.filter(
    (r) =>
      (r.status === "WAITING_CI" || r.status === "REVIEW_REQUIRED") &&
      withSha(r),
  );
  if (awaiting.length === 0) return null;
  const winner = awaiting.find((r) => r.tournamentResult === "WINNER");
  if (winner) return winner;
  // Prefer the delivered WAITING_CI contender over REVIEW_REQUIRED leftovers.
  const waiting = awaiting.find((r) => r.status === "WAITING_CI");
  return waiting ?? awaiting[0] ?? null;
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

/** True when maintainer tick should open a GitHub Release after merges this cycle. */
export function shouldRunMaintainerRelease(input: {
  autoRelease: boolean;
  mergedTitles: string[];
}): boolean {
  return input.autoRelease && input.mergedTitles.length > 0;
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

/** P-144 — audit + maintainer event after a GitHub Release is created (or idempotent hit). */
export async function recordMaintainerReleaseOutcome(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    tagName: string;
    htmlUrl: string;
    releaseTagStyle: MaintainerPolicy["releaseTagStyle"];
    mergeCount: number;
    highlights: string[];
  },
): Promise<void> {
  const meta = {
    tagName: input.tagName,
    htmlUrl: input.htmlUrl,
    releaseTagStyle: input.releaseTagStyle,
    mergeCount: input.mergeCount,
    highlights: input.highlights.slice(0, 20),
    prodDeploy: false,
  };
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.release",
    targetType: "project",
    targetId: input.projectId,
    meta,
  });
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "release",
    payload: meta,
  });
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
  const wsBudget = await getWorkspaceBudgetRow(db, input.workspaceId);
  const { policy, clamps } = sanitizePolicyForMaintainerEnable(
    input.policy,
    DEFAULT_MAINTAINER_POLICY,
    { existingWorkspaceCapMicros: wsBudget?.capMicros ?? null },
  );
  policy.visionBriefId =
    input.policy?.visionBriefId ??
    brief?.id ??
    project.currentBriefId ??
    null;

  if (shouldInitWorkspaceBudgetOnEnable(wsBudget?.capMicros ?? null)) {
    const softAlert = Math.floor(
      policy.monthlyBudgetMicros * policy.softAlertRatio,
    );
    // First envelope only — never raise an existing cap via maintainer enable (AG-030).
    await setWorkspaceBudget(db, {
      workspaceId: input.workspaceId,
      capMicros: policy.monthlyBudgetMicros,
      softAlertMicros: softAlert,
      actor: input.actor,
      status: "active",
      period: "monthly",
      pauseProjectBudgets: true,
    });
  }

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

  const duelN = Math.max(1, Math.min(3, policy.maxTournamentN));
  const { arena } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    defaultContenderN: duelN,
    contenderCount: duelN,
    minHuman: true,
  });
  // Pin arena width to policy even when the arena already existed.
  if (arena.defaultContenderN !== duelN) {
    await db
      .update(arenas)
      .set({ defaultContenderN: duelN, updatedAt: new Date() })
      .where(eq(arenas.id, arena.id));
  }
  if (!arena.minHuman) {
    await setArenaMinHuman(db, {
      workspaceId: input.workspaceId,
      arenaId: arena.id,
      minHuman: true,
      actor: input.actor,
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
    meta: {
      policy,
      prodWritesEnabled: arena.prodWritesEnabled === true,
      autoRelease: policy.autoRelease,
      escalationClamps: clamps,
    },
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
 * QUEUED tasks with no claimable agent_run (fan-out failed, Stop cancelled
 * runs, contender budget 0, …) get a fresh enqueue while the arena is live.
 */
export async function requeueOrphanQueuedTasks(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<{ resumed: number; errors: string[] }> {
  const errors: string[] = [];
  const arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  if (!arena || arena.status === "KILLED" || arena.status === "PAUSED") {
    return { resumed: 0, errors };
  }

  await ensureContenderEnqueueBudget(db, {
    workspaceId: input.workspaceId,
    arenaId: arena.id,
  });

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

  let resumed = 0;
  for (const task of queued) {
    const runs = await listRunsForTask(db, input.workspaceId, task.id);
    // Arena mode requires contenderId — orphan QUEUED rows without one block fan-out.
    const active = runs.some(
      (r) =>
        ["QUEUED", "RUNNING", "VALIDATING"].includes(r.status) &&
        (arena.status === "RUNNING" || arena.status === "ARMED"
          ? Boolean(r.contenderId)
          : true),
    );
    if (active) continue;
    for (const r of runs) {
      if (
        r.status === "QUEUED" &&
        !r.contenderId &&
        (arena.status === "RUNNING" || arena.status === "ARMED")
      ) {
        await db
          .update(agentRuns)
          .set({
            status: "FAILED",
            errorCode: "orphan_no_contender",
            errorMessage: "replaced by tournament fan-out",
            updatedAt: new Date(),
          })
          .where(eq(agentRuns.id, r.id));
      }
    }
    try {
      await enqueueQueuedTask(db, {
        workspaceId: input.workspaceId,
        task,
        actor: input.actor,
        reason: "orphan_queued_requeue",
      });
      resumed += 1;
    } catch (err) {
      errors.push(
        `${task.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { resumed, errors };
}

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
      rawIdea: `Autonomous maintainer for ${repo}: invent and ship product-quality increments from the architecture roadmap under a spend cap.`,
      content: {
        title: `${name} — autonomous ship loop`,
        targetUser: "Product maintainers and end users",
        problem: `Keep ${repo} shipping real capabilities under a monthly spend cap with survivor selection.`,
        scope:
          "Product increments on the primary repo: named features, hardened behaviors, tests, and user-facing docs. Prefer M/L slices with measurable outcomes.",
        nonGoals:
          "Typos, scaffold/empty structure, timestamp dogfood, docs-only placeholders, unbounded spend, multi-repo ships without policy.",
        acceptanceCriteria: [
          "Backlog task maps to an architecture Open ID or a concrete product outcome",
          "Survivor PR opens on the primary repository with a capability-describing title",
          "Tests/validation cover the change; CI green; maintainer auto-accepts the winner",
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

  // Arm + resume BEFORE vision replan. If backlog boots while PAUSED,
  // min_human is skipped and a zombie Inbox approval is created.
  // Peer seats only — FULL_ARENA_PROFILE_KEYS is catalog, not contender width.
  const rosterKeys = rosterKeysForAvailableBudget(Number.POSITIVE_INFINITY);
  const startPolicy = parseMaintainerPolicy(project.maintainerPolicyJson);
  const duelN = Math.max(1, Math.min(3, startPolicy.maxTournamentN));
  let { arena } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    minHuman: true,
    defaultContenderN: duelN,
    contenderCount: duelN,
  });
  try {
    await applySpawnProfilesToArena(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      profileKeys: rosterKeys,
      seatCount: duelN,
    });
  } catch {
    // spawn best-effort — tick continues
  }
  if (arena.defaultContenderN !== duelN) {
    const [pinned] = await db
      .update(arenas)
      .set({ defaultContenderN: duelN, updatedAt: new Date() })
      .where(eq(arenas.id, arena.id))
      .returning();
    if (pinned) arena = pinned;
  }

  if (!arena.minHuman) {
    arena = await setArenaMinHuman(db, {
      workspaceId: input.workspaceId,
      arenaId: arena.id,
      minHuman: true,
      actor: input.actor,
    });
  }

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

  const bootstrap = await ensureAutonomousVisionAndBacklog(db, input);
  await expireStaleTaskApprovals(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });

  let liveProject = project;
  if (!project.maintainerEnabled) {
    const enabled = await enableMaintainerMode(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      policy: {
        autoMerge: true,
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
      if (!(await predecessorsAreDone(db, task.id))) {
        if (task.status === "READY_FOR_APPROVAL") {
          await applyTaskTransition(db, {
            workspaceId: input.workspaceId,
            taskId: task.id,
            actor: input.actor,
            toStatus: "DRAFT",
            reason: "waiting on predecessor",
          });
        }
        continue;
      }
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

  await ensureContenderEnqueueBudget(db, {
    workspaceId: input.workspaceId,
    arenaId: arena.id,
  });

  const orphan = await requeueOrphanQueuedTasks(db, input);
  resumedTasks += orphan.resumed;

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.start",
    targetType: "arena",
    targetId: arena.id,
    meta: {
      resumedTasks,
      orphanRequeueErrors: orphan.errors,
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
      orphanRequeueErrors: orphan.errors,
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
      defaultContenderN: MIN_DUEL_CONTENDERS,
      contenderCount: MIN_DUEL_CONTENDERS,
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
    await setWorkspaceBudget(db, {
      workspaceId: input.workspaceId,
      capMicros: policy.monthlyBudgetMicros,
      softAlertMicros: Math.floor(
        policy.monthlyBudgetMicros * policy.softAlertRatio,
      ),
      actor: input.actor,
      period: "monthly",
      pauseProjectBudgets: true,
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
    /** Installation / PAT for architecture Open ID fetch. */
    architectureToken?: string | null;
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
    if (spend.pooled) {
      await db
        .update(budgets)
        .set({ status: "paused", updatedAt: new Date() })
        .where(
          and(
            eq(budgets.workspaceId, input.workspaceId),
            isNull(budgets.projectId),
          ),
        );
    } else {
      await db
        .update(budgets)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(budgets.projectId, input.projectId));
    }
    result.paused = true;
    await recordMaintainerEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "tick",
      payload: {
        action: "hard_pause",
        spentMicros: spend.spentMicros,
        pooled: Boolean(spend.pooled),
      },
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

  try {
    await expireStaleTaskApprovals(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
  } catch (err) {
    result.errors.push(
      `stale_approvals: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const orphan = await requeueOrphanQueuedTasks(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor,
    });
    if (orphan.errors.length) {
      result.errors.push(
        ...orphan.errors.map((e) => `orphan_requeue: ${e}`),
      );
    }
  } catch (err) {
    result.errors.push(
      `orphan_requeue: ${err instanceof Error ? err.message : String(err)}`,
    );
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
          const depsOk = await predecessorsAreDone(db, task.id);
          if (!depsOk) {
            // Park dependents as DRAFT until the predecessor ships.
            if (task.status === "READY_FOR_APPROVAL") {
              await applyTaskTransition(db, {
                workspaceId: input.workspaceId,
                taskId: task.id,
                actor,
                toStatus: "DRAFT",
                reason: "waiting on predecessor",
              });
            }
            continue;
          }
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

  // Auto-accept when CI green AND tournament WINNER (or solo / same-PR fan-out).
  // Include WAITING_CI tasks whose run already promoted to REVIEW_REQUIRED.
  // Also resurrect FAILED waiting_ci_timeout tasks that still have a
  // REVIEW_REQUIRED delivery run (PR open) so unattended Accept does not stall.
  if (policy.autoMerge) {
    try {
      const timedOutFailed = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            eq(tasks.workspaceId, input.workspaceId),
            eq(tasks.status, "FAILED"),
          ),
        )
        .limit(20);
      for (const task of timedOutFailed) {
        if (task.githubPrNumber != null) continue;
        const runs = await listRunsForTask(db, input.workspaceId, task.id);
        const hasReviewDelivery = runs.some(
          (r) => r.status === "REVIEW_REQUIRED" && r.prNumber != null,
        );
        const hitTimeout = runs.some(
          (r) => r.errorCode === "waiting_ci_timeout",
        );
        if (!hasReviewDelivery || !hitTimeout) continue;
        try {
          await applyTaskTransition(db, {
            workspaceId: input.workspaceId,
            taskId: task.id,
            toStatus: "REVIEW_REQUIRED",
            actor,
            reason:
              "unattended recover: CI evidence after waiting_ci_timeout",
          });
        } catch {
          /* illegal / race — skip */
        }
      }

      const pending = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            eq(tasks.workspaceId, input.workspaceId),
            inArray(tasks.status, ["REVIEW_REQUIRED", "WAITING_CI"]),
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
          if (
            task.status === "WAITING_CI" &&
            candidate.status === "REVIEW_REQUIRED"
          ) {
            await applyTaskTransition(db, {
              workspaceId: input.workspaceId,
              taskId: task.id,
              toStatus: "REVIEW_REQUIRED",
              actor,
              reason: "run accept-ready — sync task out of WAITING_CI",
            });
          }
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

  // Vision replan — continuous backlog refills when the board is idle under budget.
  // Stale REVIEW_REQUIRED after waiting_ci_timeout (not accept-ready) does not
  // count as busy — otherwise one timed-out review deadlocks replan (AG-031).
  const openRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, [...OPEN_DELIVERY_STATUSES]),
      ),
    )
    .limit(50);
  let busyOpenCount = 0;
  for (const openTask of openRows) {
    if (openTask.status !== "REVIEW_REQUIRED") {
      busyOpenCount += 1;
      continue;
    }
    const runs = await listRunsForTask(db, input.workspaceId, openTask.id);
    const hitTimeout = runs.some((r) => r.errorCode === "waiting_ci_timeout");
    if (!hitTimeout) {
      busyOpenCount += 1;
      continue;
    }
    const candidate = selectAutoAcceptRun(runs);
    let acceptReady = false;
    if (candidate) {
      try {
        acceptReady = (await getRunCiFitness(db, candidate.id)).acceptReady;
      } catch {
        acceptReady = false;
      }
    }
    if (
      openTaskCountsAsBusyForBacklog({
        status: openTask.status,
        hasWaitingCiTimeout: hitTimeout,
        acceptReady,
      })
    ) {
      busyOpenCount += 1;
    }
  }
  const due = shouldReplanVision({
    lastVisionReplanAt: project.lastVisionReplanAt,
    replanIntervalDays: policy.replanIntervalDays,
    continuousBacklog: policy.continuousBacklog,
    openWorkCount: busyOpenCount,
    availableMicros: spend.availableMicros,
  });
  if (due) {
    try {
      await runVisionReplan(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actor,
        architectureToken: input.architectureToken,
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

/**
 * Meta-tournament challenger is the same role (strategy peer).
 * Cross-role pairings (fixer↔qa, engineer↔reviewer) are invalid.
 */
export function pickMetaTournamentChallenger(
  championKey: string,
): string {
  return BOUNDED_KEYS.has(championKey) ? championKey : "engineer";
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
    " Prefer capability-complete diffs with tests, stay within path allowlist, and refuse scaffold/typo-only PRs.";
  // Evolve assigned skills with a short tip (gated self-improve).
  try {
    const { evolveSkill, parseSkillKeysJson } = await import("./skills.js");
    const skillKeys = parseSkillKeysJson(base.skillKeysJson);
    const skillTip =
      "Prefer capability-complete diffs with tests; refuse scaffold/typo-only PRs.";
    for (const key of skillKeys.slice(0, 2)) {
      await evolveSkill(db, {
        workspaceId: input.workspaceId,
        key,
        tip: skillTip,
        runId: winners[0]?.id ?? null,
        actor: input.actor,
      });
    }
  } catch {
    /* skills optional */
  }

  if (!base.promptGuidance.includes("refuse scaffold/typo-only")) {
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

  // Meta-tournament: same-role strategy peers on the project arena
  if (winners.length >= 3) {
    const challengerKey = pickMetaTournamentChallenger(base.key);
    const championStrategy =
      base.strategyDefault === "balanced" ||
      base.strategyDefault === "blitz" ||
      base.strategyDefault === "fortress"
        ? base.strategyDefault
        : "balanced";
    const flip = flipContenderStrategy(championStrategy);
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
          challengerStrategy?: string;
        };
        alreadyArmed =
          p.championKey === base.key &&
          (p.challengerKey === challengerKey || p.challengerKey === base.key) &&
          p.challengerStrategy === flip;
      } catch {
        alreadyArmed = false;
      }
    }
    if (!alreadyArmed) {
      let availableMicros = Number.POSITIVE_INFINITY;
      try {
        const spend = await getProjectSpendSummary(
          db,
          input.workspaceId,
          input.projectId,
        );
        availableMicros = spend.availableMicros;
      } catch {
        /* allow meta when spend unknown */
      }
      if (availableMicros >= LEAN_ROSTER_AVAILABLE_MICROS) {
      await applySpawnProfilesToArena(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        actor: input.actor,
        profileKeys: [base.key],
        seatCount: 2,
        strategies: [championStrategy, flip],
      });
      // Meta duel = champion vs strategy peer (N=2), not a solo pin.
      const arenaRow = await getArenaForProject(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      });
      if (arenaRow && arenaRow.defaultContenderN < 2) {
        await db
          .update(arenas)
          .set({ defaultContenderN: 2, updatedAt: new Date() })
          .where(eq(arenas.id, arenaRow.id));
      }
      changed = true;
      await recordMaintainerEvent(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: "meta_tournament",
        payload: {
          championKey: base.key,
          challengerKey,
          challengerStrategy: flip,
          applied: true,
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
          applied: true,
        },
      });
      }
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
    /** Optional architecture / roadmap markdown (Open P-/W-/A-/S- rows). */
    roadmapMarkdown?: string;
    /** Installation / PAT when env ARCHITECTURE_* tokens are unset. */
    architectureToken?: string | null;
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

  // Primary-only invent: archive / secondary product shells stay quiet.
  if (
    !policy.coordinatedMultiRepo &&
    project?.name &&
    ARCHIVE_OR_NON_PRODUCT_PROJECT_NAMES.has(project.name)
  ) {
    await recordMaintainerEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "replan",
      payload: {
        briefId: brief.id,
        taskCount: 0,
        queued: 0,
        autoQueue,
        skipped: true,
        reason: "non_primary_project",
        projectName: project.name,
      },
    });
    return { taskCount: 0, queued: 0 };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const roadmapMd =
    input.roadmapMarkdown?.trim() ||
    process.env.ARCHITECTURE_BACKLOG_MD?.trim() ||
    (await fetchArchitectureBacklogMarkdown({
      token: input.architectureToken,
      repo: policy.architectureRepo,
      paths: policy.architecturePaths,
    })) ||
    "";
  const excludeIds = await listInFlightArchitectureIds(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    architectureToken: input.architectureToken,
  });
  const archTask = pickNextArchitectureTask(
    parseArchitectureOpenTasks(roadmapMd),
    { excludeIds },
  );
  // No architecture Open ID → do not invent scaffold/generic ship tasks.
  if (!archTask) {
    const reason =
      excludeIds.length > 0
        ? "architecture_ids_in_flight"
        : "no_architecture_open_id";
    await recordMaintainerEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "replan",
      payload: {
        briefId: brief.id,
        taskCount: 0,
        queued: 0,
        autoQueue,
        skipped: true,
        reason,
        excludeIds,
      },
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "maintainer.replan",
      targetType: "project",
      targetId: input.projectId,
      meta: {
        projectId: input.projectId,
        projectName: project?.name ?? null,
        briefId: brief.id,
        taskCount: 0,
        queued: 0,
        skipped: true,
        reason,
        excludeIds,
      },
    });
    await db
      .update(projects)
      .set({ lastVisionReplanAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, input.projectId));
    return { taskCount: 0, queued: 0 };
  }

  const estimateBand = {
    S: 500_000,
    M: 2_000_000,
    L: 5_000_000,
  } as const;
  const complexity = archTask.estimateComplexity;
  const shipTitle = archTask.title.slice(0, 200);
  const shipGoal = [
    archTask.goal.slice(0, 1600),
    "",
    "Constraints: edit the primary product tree only (apps/, packages/, docs/, scripts/).",
    "Do not invent parallel Go trees (arena/, internal/, roster/) or write to archive/secondary repos.",
  ]
    .join("\n")
    .slice(0, 2000);
  const shipAcceptance = archTask.acceptanceCriteria;
  const inventPaths =
    policy.pathAllowlist.length > 0
      ? policy.pathAllowlist
      : DEFAULT_PRODUCT_ALLOWED_PATHS;

  const plan = await generateProjectPlan(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    milestones: [
      {
        title: `Maintainer cycle ${stamp}`,
        description: `Autonomous replan from vision: ${brief.title} · roadmap ${archTask.id}`,
        tasks: [
          {
            key: `m-${stamp}-ship`,
            title: shipTitle,
            goal: shipGoal,
            scope:
              brief.scope.slice(0, 800) ||
              "Primary-repo product increment with tests and docs as needed",
            allowedPaths: inventPaths,
            acceptanceCriteria: shipAcceptance.slice(0, 8),
            estimateMicros: estimateBand[complexity],
            estimateComplexity: complexity,
            dependsOn: [],
            priority: 10,
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

  // Arm peer engineer seats; re-pin defaultContenderN to maxTournamentN
  // so invent/replan cannot drift duel width.
  try {
    const [proj] = await db
      .select({ maintainerPolicyJson: projects.maintainerPolicyJson })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    const pinN = Math.max(
      1,
      Math.min(3, parseMaintainerPolicy(proj?.maintainerPolicyJson).maxTournamentN),
    );
    await applySpawnProfilesToArena(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actor: input.actor,
      profileKeys: rosterKeysForAvailableBudget(Number.POSITIVE_INFINITY),
      seatCount: pinN,
    });
    const arena = await getArenaForProject(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    if (arena && arena.defaultContenderN !== pinN) {
      await db
        .update(arenas)
        .set({ defaultContenderN: pinN, updatedAt: new Date() })
        .where(eq(arenas.id, arena.id));
    }
  } catch {
    // arena may not exist yet — tick/enable creates it
  }

  let queued = 0;
  if (autoQueue) {
    const toyTitleRe =
      /\b(scaffold project structure|tiny readme typo|propose next scoped improvement|scoped improvement|autonomous ship loop)\b/i;
    for (const m of plan.milestones) {
      for (const tv of m.tasks) {
        if (queued >= maxAutoQueue) break;
        // Only root tasks (no deps) — dependents wait for later ticks / human
        if ((tv.dependsOnTaskIds?.length ?? 0) > 0) continue;
        if (tv.task.status !== "DRAFT") continue;
        if (toyTitleRe.test(tv.task.title)) continue;
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
              projectId: input.projectId,
              projectName: project?.name ?? null,
              taskId: tv.task.id,
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
    payload: {
      briefId: brief.id,
      taskCount,
      queued,
      autoQueue,
      architectureId: archTask.id,
      architectureTitle: archTask.title.slice(0, 160),
    },
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.replan",
    targetType: "project",
    targetId: input.projectId,
    meta: {
      projectId: input.projectId,
      projectName: project?.name ?? null,
      briefId: brief.id,
      taskCount,
      queued,
      architectureId: archTask.id,
      architectureTitle: archTask.title.slice(0, 160),
    },
  });

  return { taskCount, queued };
}

export type MaintainerMetrics = {
  projectId: string;
  workspaceId: string;
  windowDays: number;
  merges: number;
  /** GitHub merges recorded by maintainer auto_merge (merged: true). */
  verifiedMerges: number;
  spendMicros: number;
  capMicros: number;
  /** Project spend / workspace cap when pooled (null when cap is zero). */
  budgetBurnRatio: number | null;
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

export type MaintainerProjectRollup = MaintainerMetrics & {
  projectName: string;
};

export type MaintainerRollupTotals = {
  merges: number;
  verifiedMerges: number;
  spendMicros: number;
  capMicros: number;
  budgetBurnRatio: number | null;
  humanTouches: number;
  maintainerProjectCount: number;
  /** Verified merges with zero human PR touches in the rollup window. */
  zeroTouchDelivery: boolean;
};

export type WorkspaceMaintainerRollup = {
  windowDays: number;
  workspace: {
    spentMicros: number;
    capMicros: number;
    budgetBurnRatio: number | null;
    pooled: boolean;
  };
  projects: MaintainerProjectRollup[];
  totals: MaintainerRollupTotals;
};

/** Envelope burn for maintainer dashboards (0–1, capped). */
export function computeBudgetBurnRatio(
  spentMicros: number,
  capMicros: number,
): number | null {
  if (!Number.isFinite(capMicros) || capMicros <= 0) return null;
  if (!Number.isFinite(spentMicros) || spentMicros <= 0) return 0;
  return Math.min(1, spentMicros / capMicros);
}

export function isVerifiedAutoMergePayload(payload: string): boolean {
  try {
    const v = JSON.parse(payload) as { merged?: boolean };
    return v.merged === true;
  } catch {
    return false;
  }
}

export function countVerifiedMergesFromMaintainerEvents(
  events: Array<{ kind: string; payload: string }>,
): number {
  return events.filter(
    (e) => e.kind === "auto_merge" && isVerifiedAutoMergePayload(e.payload),
  ).length;
}

/** Aggregate multi-project maintainer KPIs without double-counting pooled spend. */
export function summarizeMaintainerRollupTotals(input: {
  projects: Array<
    Pick<MaintainerMetrics, "merges" | "verifiedMerges" | "humanTouches">
  >;
  workspaceSpend: { spentMicros: number; capMicros: number } | null;
}): MaintainerRollupTotals {
  const merges = input.projects.reduce((s, m) => s + m.merges, 0);
  const verifiedMerges = input.projects.reduce(
    (s, m) => s + m.verifiedMerges,
    0,
  );
  const humanTouches = input.projects.reduce((s, m) => s + m.humanTouches, 0);
  const spendMicros = input.workspaceSpend?.spentMicros ?? 0;
  const capMicros = input.workspaceSpend?.capMicros ?? 0;
  return {
    merges,
    verifiedMerges,
    spendMicros,
    capMicros,
    budgetBurnRatio: computeBudgetBurnRatio(spendMicros, capMicros),
    humanTouches,
    maintainerProjectCount: input.projects.length,
    zeroTouchDelivery: humanTouches === 0 && verifiedMerges > 0,
  };
}

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

  const verifiedMerges = countVerifiedMergesFromMaintainerEvents(events);
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
  // projectSpentMicros is optional on pooled summaries — fall back to spentMicros.
  const projectSpendMicros =
    spend.pooled && spend.projectSpentMicros != null
      ? spend.projectSpentMicros
      : spend.spentMicros;
  return {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    windowDays: days,
    merges,
    verifiedMerges,
    spendMicros: projectSpendMicros,
    capMicros: spend.capMicros,
    budgetBurnRatio: computeBudgetBurnRatio(
      projectSpendMicros,
      spend.capMicros,
    ),
    spendWithinCap: spend.spentMicros <= spend.capMicros,
    humanTouches: humanAudits.length,
    policyViolations,
    autoAccepts,
    selfImproves,
    metaTournaments,
    replans,
    costPerAcceptedMergeMicros:
      merges > 0 ? Math.round(projectSpendMicros / merges) : 0,
    winningProfileKeys,
    ticks,
    maintainerEnabled: project.maintainerEnabled,
  };
}

export async function getWorkspaceMaintainerRollup(
  db: Database,
  input: { workspaceId: string; days?: number },
): Promise<WorkspaceMaintainerRollup> {
  const days = input.days ?? 30;
  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, input.workspaceId),
        eq(projects.maintainerEnabled, true),
      ),
    );
  const wsSpend = await getWorkspaceSpendSummary(db, input.workspaceId);
  const projectsMetrics: MaintainerProjectRollup[] = [];
  for (const p of rows) {
    const metrics = await getMaintainerMetrics(db, {
      workspaceId: input.workspaceId,
      projectId: p.id,
      days,
    });
    projectsMetrics.push({ ...metrics, projectName: p.name });
  }
  const workspaceSpent = wsSpend?.spentMicros ?? 0;
  const workspaceCap = wsSpend?.capMicros ?? 0;
  return {
    windowDays: days,
    workspace: {
      spentMicros: workspaceSpent,
      capMicros: workspaceCap,
      budgetBurnRatio: computeBudgetBurnRatio(workspaceSpent, workspaceCap),
      pooled: wsSpend != null,
    },
    projects: projectsMetrics,
    totals: summarizeMaintainerRollupTotals({
      projects: projectsMetrics,
      workspaceSpend: wsSpend
        ? { spentMicros: workspaceSpent, capMicros: workspaceCap }
        : null,
    }),
  };
}

/** GitHub branch protection / review gate — do not retry merge every tick. */
export function isMergeProtectionBlock(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("approving review") ||
    m.includes("review is required") ||
    m.includes("code owner") ||
    m.includes("not authorized") ||
    m.includes("protected branch") ||
    m.includes("required status check") ||
    m.includes("changes requested")
  );
}

/** PR already done / closed — never retry. */
export function isTerminalMergeSkip(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already merged") ||
    m.includes("pull request is closed") ||
    m.includes("pr is closed") ||
    (m.includes("closed") && m.includes("merged"))
  );
}

/**
 * GitHub says the PR isn't mergeable yet (conflicts, dirty, pending checks).
 * Transient — retry after cooldown, not every maintainer tick.
 */
export function isTransientNotMergeable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not mergeable") ||
    m.includes("is not mergeable") ||
    m.includes("merge conflict") ||
    (m.includes("dirty") && m.includes("merge"))
  );
}

/** Back off failed "not mergeable" retries so Activity isn't flooded. */
export const AUTO_MERGE_RETRY_COOLDOWN_MS = 30 * 60_000;

export type AutoMergeOutcomeRow = {
  kind: string;
  createdAt: Date | string;
  payload: {
    prNumber?: number;
    merged?: boolean;
    message?: string;
    blocked?: boolean;
  };
};

/**
 * PRs that should not be merge-attempted on this tick.
 * - permanently: merged, blocked, protection, already closed
 * - temporarily: recent "not mergeable" within cooldown
 */
export function resolveAutoMergeSkipPrs(
  rows: AutoMergeOutcomeRow[],
  nowMs = Date.now(),
  cooldownMs = AUTO_MERGE_RETRY_COOLDOWN_MS,
): Set<number> {
  const skip = new Set<number>();
  // Newest-first: first decision for a PR wins.
  const seen = new Set<number>();
  for (const row of rows) {
    const pr = row.payload.prNumber;
    if (typeof pr !== "number" || seen.has(pr)) continue;
    seen.add(pr);

    if (row.kind === "merge_blocked" || row.payload.blocked === true) {
      skip.add(pr);
      continue;
    }
    if (row.payload.merged === true) {
      skip.add(pr);
      continue;
    }

    const message =
      typeof row.payload.message === "string" ? row.payload.message : "";
    if (isMergeProtectionBlock(message) || isTerminalMergeSkip(message)) {
      skip.add(pr);
      continue;
    }
    if (row.payload.merged === false && isTransientNotMergeable(message)) {
      const created = new Date(row.createdAt).getTime();
      if (Number.isFinite(created) && nowMs - created < cooldownMs) {
        skip.add(pr);
      }
    }
  }
  return skip;
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

  const blockRows = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, projectId),
        inArray(maintainerEvents.kind, ["merge_blocked", "auto_merge"]),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(80);

  const outcomeRows: AutoMergeOutcomeRow[] = [];
  for (const row of blockRows) {
    let payload: AutoMergeOutcomeRow["payload"] = {};
    try {
      payload = JSON.parse(row.payload) as AutoMergeOutcomeRow["payload"];
    } catch {
      continue;
    }
    outcomeRows.push({
      kind: row.kind,
      createdAt: row.createdAt,
      payload,
    });
  }
  const skipPrs = resolveAutoMergeSkipPrs(outcomeRows);

  const out: Array<{ task: Task; prNumber: number; runId: string }> = [];
  const seenPr = new Set<number>();
  for (const ev of recent) {
    let payload: { taskId?: string; prNumber?: number; runId?: string } = {};
    try {
      payload = JSON.parse(ev.payload) as typeof payload;
    } catch {
      continue;
    }
    if (!payload.taskId || !payload.prNumber || !payload.runId) continue;
    if (skipPrs.has(payload.prNumber) || seenPr.has(payload.prNumber)) {
      continue;
    }
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, payload.taskId))
      .limit(1);
    if (!task || task.status !== "DONE") continue;
    seenPr.add(payload.prNumber);
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
  const blocked =
    !input.merged && isMergeProtectionBlock(input.message);
  await recordMaintainerEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: blocked ? "merge_blocked" : "auto_merge",
    payload: {
      taskId: input.taskId,
      prNumber: input.prNumber,
      merged: input.merged,
      message: input.message,
      blocked,
    },
  });
}

/**
 * Architecture IDs already represented by open board work (workspace-wide),
 * recently completed/failed work (cooldown), or open Coppergate PRs.
 * Workspace scope stops every secondary project from re-arming the same Open ID.
 */
export async function listInFlightArchitectureIds(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    architectureToken?: string | null;
  },
): Promise<string[]> {
  // Workspace-wide open/in-flight — not just this project.
  // ORDER BY updated_at DESC is required: without it, LIMIT 300 can omit
  // recent Open IDs and replan thrash-reinvents them (ACPP P-010 class).
  const openTasks = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, [...IN_FLIGHT_ARCH_TASK_STATUSES]),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(300);

  const ids = new Set(architectureIdsFromTitles(openTasks.map((t) => t.title)));

  // Cooldown: same Open ID must not thrash after DONE/FAILED/ACCEPTED.
  const since = new Date(Date.now() - ARCHITECTURE_ID_COOLDOWN_MS);
  const recentTerminal = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        inArray(tasks.status, ["DONE", "FAILED", "ACCEPTED"]),
        gte(tasks.updatedAt, since),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(300);
  for (const id of architectureIdsFromTitles(
    recentTerminal.map((t) => t.title),
  )) {
    ids.add(id);
  }

  const token = input.architectureToken?.trim();
  if (token) {
    try {
      const bound = await getProjectForWorkspace(
        db,
        input.workspaceId,
        input.projectId,
      );
      const full = bound?.repository.baseRepoFullName;
      const [owner, name] = full?.split("/") ?? [];
      if (owner && name) {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=50`,
          {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "User-Agent": "coppergate-maintainer",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
        if (res.ok) {
          const rows = (await res.json()) as Array<{
            title?: string;
            head?: { ref?: string };
            user?: { login?: string; type?: string };
          }>;
          for (const pr of rows) {
            const title = pr.title ?? "";
            const head = pr.head?.ref ?? "";
            const login = pr.user?.login ?? "";
            const coppergateOwned =
              /^coppergate:/i.test(title) ||
              head.startsWith("coppergate/") ||
              head.startsWith("cg/") ||
              /coppergate/i.test(login);
            if (!coppergateOwned) continue;
            const id = extractArchitectureIdFromTitle(title);
            if (id) ids.add(id);
          }
        }
      }
    } catch {
      /* best-effort — task titles alone still dedupe the board */
    }
  }

  return [...ids];
}

/** Clear sticky merge_blocked so a PR can be retried after GitHub rights change. */
export async function clearMergeBlockedForProject(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    prNumbers?: number[];
    actor: string;
  },
): Promise<{ cleared: number }> {
  const rows = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, input.projectId),
        eq(maintainerEvents.kind, "merge_blocked"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(100);

  let cleared = 0;
  for (const row of rows) {
    let payload: { prNumber?: number } = {};
    try {
      payload = JSON.parse(row.payload) as typeof payload;
    } catch {
      continue;
    }
    if (
      input.prNumbers &&
      input.prNumbers.length > 0 &&
      (typeof payload.prNumber !== "number" ||
        !input.prNumbers.includes(payload.prNumber))
    ) {
      continue;
    }
    await db
      .delete(maintainerEvents)
      .where(eq(maintainerEvents.id, row.id));
    cleared += 1;
  }

  if (cleared > 0) {
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "merge.blocked_cleared",
      targetType: "project",
      targetId: input.projectId,
      meta: {
        cleared,
        prNumbers: input.prNumbers ?? null,
      },
    });
    await recordMaintainerEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "merge_unblocked",
      payload: {
        cleared,
        prNumbers: input.prNumbers ?? null,
        actor: input.actor,
      },
    });
  }
  return { cleared };
}
