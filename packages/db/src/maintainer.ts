import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  getProjectSpendSummary,
  rollMonthlyBudgetIfDue,
  setProjectBudget,
} from "./budgets.js";
import { getRunCiFitness } from "./ci-evidence.js";
import { setProjectAutonomyLevel, setProjectMergeEnabled } from "./project-policy.js";
import { ensureArenaForProject, setArenaMinHuman } from "./arena.js";
import {
  agentProfiles,
  agentRuns,
  arenas,
  auditEvents,
  budgets,
  maintainerEvents,
  projects,
  tasks,
  type AgentProfile,
  type MaintainerEvent,
  type Project,
  type Task,
} from "./schema.js";
import { decideTaskReview } from "./task-transitions.js";
import { listRunsForTask } from "./runs.js";
import { armSignalEvent, listSignalEvents } from "./signals.js";
import { generateProjectPlan } from "./plans.js";
import { getLatestBriefForProject } from "./briefs.js";
import { setProjectMultiRepoPolicy } from "./projects.js";

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
};

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
    };
  } catch {
    return { ...DEFAULT_MAINTAINER_POLICY, enabled: false };
  }
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

  // Auto-accept REVIEW_REQUIRED tasks when CI accept-ready
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
        const runs = await listRunsForTask(db, input.workspaceId, task.id);
        const latest = runs[0];
        if (!latest) continue;
        const fitness = await getRunCiFitness(db, latest.id);
        if (!fitness.acceptReady) continue;

        try {
          await decideTaskReview(db, {
            workspaceId: input.workspaceId,
            taskId: task.id,
            actor,
            decision: "accept",
            note: "maintainer auto-accept (CI green)",
          });
          result.autoAccepted += 1;
          result.autoMergedCandidates.push({
            taskId: task.id,
            prNumber: latest.prNumber ?? null,
            runId: latest.id,
          });
          await recordMaintainerEvent(db, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            kind: "auto_accept",
            payload: {
              taskId: task.id,
              runId: latest.id,
              prNumber: latest.prNumber,
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

  // Vision replan
  const replanMs = policy.replanIntervalDays * 24 * 60 * 60 * 1000;
  const due =
    !project.lastVisionReplanAt ||
    Date.now() - project.lastVisionReplanAt.getTime() >= replanMs;
  if (due && spend.availableMicros > 100_000) {
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

/**
 * Evolve workspace AgentProfile prompt within allowlists (cannot raise autonomy / tools).
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

  const profileKey = winners[0]?.agentProfileKey ?? "engineer";
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

  const tip =
    " Prefer minimal diffs, deterministic tests, and stay within path allowlist. Cut spend when fitness is already high.";
  if (base.promptGuidance.includes("Prefer minimal diffs")) {
    return false;
  }

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

  if (!evolved) return false;

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
  return true;
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
 * Vision-driven replan: append a small cycle milestone from the approved brief
 * without per-feature human approve (maintainer mode).
 */
export async function runVisionReplan(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
  },
): Promise<{ taskCount: number }> {
  const brief = await getLatestBriefForProject(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!brief || brief.status !== "approved") {
    throw new MaintainerError("invalid", "Approved vision brief required");
  }

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
            key: `m-${stamp}-triage`,
            title: "Triage backlog against vision",
            goal: `Align open work with: ${brief.problem.slice(0, 200)}`,
            scope: brief.scope.slice(0, 500) || "Small scoped improvements only",
            allowedPaths: ["**/*"],
            acceptanceCriteria: [
              "At least one verified PR or explicit noop with rationale",
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
            scope: "One small deliverable; prefer bugs/CI over large features under micro-budget",
            allowedPaths: ["**/*"],
            acceptanceCriteria: [
              "CI green on primary",
              "PR merged under maintainer policy",
            ],
            estimateMicros: 120_000,
            estimateComplexity: "S" as const,
            dependsOn: [`m-${stamp}-triage`],
            priority: 20,
          },
        ],
      },
    ],
  });

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
    payload: { briefId: brief.id, taskCount },
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "maintainer.replan",
    targetType: "project",
    targetId: input.projectId,
    meta: { briefId: brief.id, taskCount },
  });

  return { taskCount };
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
  const ticks = events.filter((e) => e.kind === "tick").length;
  const policyViolations = events.filter(
    (e) => e.kind === "tick" && e.payload.includes("policy_violation"),
  ).length;

  return {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    windowDays: days,
    merges: doneTasks.length,
    spendMicros: spend.spentMicros,
    capMicros: spend.capMicros,
    spendWithinCap: spend.spentMicros <= spend.capMicros,
    humanTouches: humanAudits.length,
    policyViolations,
    autoAccepts,
    selfImproves,
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
