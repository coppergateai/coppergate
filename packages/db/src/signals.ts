import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import { listProjectsForWorkspace } from "./projects.js";
import {
  autoArmRules,
  milestones,
  productBriefs,
  projects,
  repositoryConnections,
  signalEvents,
  tasks,
  type AutoArmRule,
  type SignalEvent,
  type Task,
} from "./schema.js";
import { notifyWorkspace } from "./notify.js";
import {
  applySpawnProfilesToArena,
  resolveSpawnProfileKeys,
} from "./profiles.js";
import { submitTaskForApproval } from "./task-transitions.js";

export class SignalError extends Error {
  readonly code:
    | "not_found"
    | "invalid"
    | "conflict"
    | "forbidden"
    | "failed";
  constructor(code: SignalError["code"], message: string) {
    super(message);
    this.name = "SignalError";
    this.code = code;
  }
}

export type SignalEnvelopeInput = {
  provider: string;
  externalId: string;
  fingerprint: string;
  severity: string;
  title: string;
  body: string;
  repoHint?: string | null;
  urls?: string[];
  labels?: string[];
  projectHint?: string | null;
  rawRef?: string | null;
};

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function severityAtLeast(actual: string, minimum: string): boolean {
  return (SEVERITY_RANK[actual] ?? 2) >= (SEVERITY_RANK[minimum] ?? 3);
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export async function listSignalEvents(
  db: Database,
  workspaceId: string,
  opts?: { status?: string; provider?: string; limit?: number },
): Promise<SignalEvent[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const conditions = [eq(signalEvents.workspaceId, workspaceId)];
  if (opts?.status) conditions.push(eq(signalEvents.status, opts.status));
  if (opts?.provider) conditions.push(eq(signalEvents.provider, opts.provider));
  return db
    .select()
    .from(signalEvents)
    .where(and(...conditions))
    .orderBy(desc(signalEvents.receivedAt))
    .limit(limit);
}

export async function getSignalEvent(
  db: Database,
  workspaceId: string,
  signalId: string,
): Promise<SignalEvent | null> {
  const [row] = await db
    .select()
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.id, signalId),
        eq(signalEvents.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listAutoArmRules(
  db: Database,
  workspaceId: string,
): Promise<AutoArmRule[]> {
  return db
    .select()
    .from(autoArmRules)
    .where(eq(autoArmRules.workspaceId, workspaceId))
    .orderBy(desc(autoArmRules.createdAt));
}

export async function upsertAutoArmRule(
  db: Database,
  input: {
    workspaceId: string;
    id?: string;
    projectId?: string | null;
    provider?: string;
    minSeverity?: string;
    pathAllowlist?: string[];
    labelMatch?: string[];
    enabled?: boolean;
    armArena?: boolean;
    profileKeys?: string[];
    actor: string;
  },
): Promise<AutoArmRule> {
  const now = new Date();
  if (input.id) {
    const [updated] = await db
      .update(autoArmRules)
      .set({
        projectId: input.projectId === undefined ? undefined : input.projectId,
        provider: input.provider,
        minSeverity: input.minSeverity,
        pathAllowlistJson:
          input.pathAllowlist !== undefined
            ? JSON.stringify(input.pathAllowlist)
            : undefined,
        labelMatchJson:
          input.labelMatch !== undefined
            ? JSON.stringify(input.labelMatch)
            : undefined,
        enabled: input.enabled,
        armArena: input.armArena,
        profileKeysJson:
          input.profileKeys !== undefined
            ? JSON.stringify(input.profileKeys)
            : undefined,
        updatedAt: now,
      })
      .where(
        and(
          eq(autoArmRules.id, input.id),
          eq(autoArmRules.workspaceId, input.workspaceId),
        ),
      )
      .returning();
    if (!updated) throw new SignalError("not_found", "auto-arm rule not found");
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "signal.rule.update",
      targetType: "auto_arm_rule",
      targetId: updated.id,
      meta: { provider: updated.provider },
    });
    return updated;
  }

  const [created] = await db
    .insert(autoArmRules)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      provider: input.provider ?? "*",
      minSeverity: input.minSeverity ?? "high",
      pathAllowlistJson: JSON.stringify(input.pathAllowlist ?? []),
      labelMatchJson: JSON.stringify(input.labelMatch ?? []),
      enabled: input.enabled ?? true,
      armArena: input.armArena ?? true,
      profileKeysJson: JSON.stringify(input.profileKeys ?? ["fixer"]),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.rule.create",
    targetType: "auto_arm_rule",
    targetId: created!.id,
    meta: { provider: created!.provider },
  });
  return created!;
}

function ruleMatches(
  rule: AutoArmRule,
  envelope: SignalEnvelopeInput,
): boolean {
  if (!rule.enabled) return false;
  if (rule.provider !== "*" && rule.provider !== envelope.provider) {
    return false;
  }
  if (!severityAtLeast(envelope.severity, rule.minSeverity)) return false;
  const labels = envelope.labels ?? [];
  const required = parseJsonArray(rule.labelMatchJson);
  if (required.length > 0 && !required.some((l) => labels.includes(l))) {
    return false;
  }
  const paths = parseJsonArray(rule.pathAllowlistJson);
  if (paths.length > 0) {
    const hint = envelope.repoHint ?? "";
    const body = envelope.body ?? "";
    const ok = paths.some((p) => hint.includes(p) || body.includes(p));
    if (!ok) return false;
  }
  return true;
}

async function resolveProjectId(
  db: Database,
  workspaceId: string,
  envelope: SignalEnvelopeInput,
  ruleProjectId: string | null | undefined,
): Promise<string | null> {
  if (ruleProjectId) return ruleProjectId;
  if (envelope.projectHint) {
    const [byId] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.id, envelope.projectHint),
        ),
      )
      .limit(1);
    if (byId) return byId.id;
  }
  if (envelope.repoHint) {
    const rows = await listProjectsForWorkspace(db, workspaceId);
    const match = rows.find(
      (r) =>
        r.repository.baseRepoFullName === envelope.repoHint ||
        r.repository.baseRepoFullName.endsWith(`/${envelope.repoHint}`) ||
        r.repository.baseRepoFullName.includes(envelope.repoHint!),
    );
    if (match) return match.project.id;
  }
  const rows = await listProjectsForWorkspace(db, workspaceId).then((r) =>
    r.filter((x) => x.project.status !== "archived"),
  );
  // Prefer exact single-project workspaces for auto-arm.
  if (rows.length === 1) return rows[0]!.project.id;
  return rows[0]?.project.id ?? null;
}

/**
 * Insert signal (dedupe on workspace+provider+externalId). Optionally auto-arm.
 */
export async function ingestSignal(
  db: Database,
  input: {
    workspaceId: string;
    envelope: SignalEnvelopeInput;
    actor?: string;
    /** Force project when known (CI failure path). */
    projectId?: string | null;
    /** Skip auto-arm evaluation (manual inbox only). */
    skipAutoArm?: boolean;
  },
): Promise<{
  event: SignalEvent;
  duplicate: boolean;
  armed: boolean;
  task: Task | null;
}> {
  const actor = input.actor ?? "system:signal";
  const env = input.envelope;
  const now = new Date();

  const existing = await db
    .select()
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.workspaceId, input.workspaceId),
        eq(signalEvents.provider, env.provider),
        eq(signalEvents.externalId, env.externalId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return {
      event: existing[0],
      duplicate: true,
      armed: existing[0].status === "armed",
      task: null,
    };
  }

  // Soft dedupe by fingerprint (same storm) — record as ignored duplicate-ish
  const [fpHit] = await db
    .select()
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.workspaceId, input.workspaceId),
        eq(signalEvents.fingerprint, env.fingerprint),
        or(
          eq(signalEvents.status, "armed"),
          eq(signalEvents.status, "received"),
        ),
      ),
    )
    .limit(1);

  const [inserted] = await db
    .insert(signalEvents)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      provider: env.provider,
      externalId: env.externalId,
      fingerprint: env.fingerprint,
      severity: env.severity,
      title: env.title.slice(0, 500),
      body: (env.body ?? "").slice(0, 20_000),
      repoHint: env.repoHint ?? null,
      urlsJson: JSON.stringify(env.urls ?? []),
      labelsJson: JSON.stringify(env.labels ?? []),
      rawRef: env.rawRef ?? null,
      status: fpHit ? "ignored" : "received",
      errorMessage: fpHit ? "fingerprint_dedupe" : null,
      receivedAt: now,
      updatedAt: now,
    })
    .returning();

  const event = inserted!;
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor,
    action: "signal.ingest",
    targetType: "signal_event",
    targetId: event.id,
    meta: {
      provider: env.provider,
      severity: env.severity,
      duplicateFingerprint: Boolean(fpHit),
    },
  });

  if (fpHit || input.skipAutoArm) {
    return { event, duplicate: false, armed: false, task: null };
  }

  const rules = await listAutoArmRules(db, input.workspaceId);
  const matched = rules.find((r) => ruleMatches(r, env));
  if (!matched) {
    return { event, duplicate: false, armed: false, task: null };
  }

  try {
    const armed = await armSignalEvent(db, {
      workspaceId: input.workspaceId,
      signalId: event.id,
      actor,
      projectId: input.projectId ?? matched.projectId,
      armArena: matched.armArena,
      profileKeys: parseJsonArray(matched.profileKeysJson),
    });
    return {
      event: armed.event,
      duplicate: false,
      armed: true,
      task: armed.task,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(signalEvents)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(signalEvents.id, event.id))
      .returning();
    return {
      event: failed ?? event,
      duplicate: false,
      armed: false,
      task: null,
    };
  }
}

async function createTaskFromSignal(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    event: SignalEvent;
    actor: string;
    profileKeys: string[];
  },
): Promise<Task> {
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
  if (!project) throw new SignalError("not_found", "project not found");

  let briefId = project.currentBriefId;
  if (!briefId) {
    const [brief] = await db
      .select()
      .from(productBriefs)
      .where(eq(productBriefs.projectId, input.projectId))
      .orderBy(desc(productBriefs.revision))
      .limit(1);
    briefId = brief?.id ?? null;
  }
  if (!briefId) {
    throw new SignalError(
      "invalid",
      "project needs a brief before arming signals",
    );
  }

  let [milestone] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, input.projectId))
    .orderBy(desc(milestones.createdAt))
    .limit(1);

  if (!milestone) {
    const now = new Date();
    const [created] = await db
      .insert(milestones)
      .values({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        briefId,
        title: "Signal imports",
        description: "Tasks created from external signals (D13)",
        sequence: 998,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    milestone = created!;
  }

  const profile = input.profileKeys[0] ?? "fixer";
  const labels = parseJsonArray(input.event.labelsJson);
  let estimateMicros = 50_000;
  for (const l of labels) {
    if (l.startsWith("spend_cap:")) {
      const n = Number(l.slice("spend_cap:".length));
      if (Number.isFinite(n) && n > 0) {
        estimateMicros = Math.min(estimateMicros, n);
      }
    }
  }
  const now = new Date();
  const [task] = await db
    .insert(tasks)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      milestoneId: milestone.id,
      briefId,
      title: input.event.title.slice(0, 200),
      goal: input.event.body || input.event.title,
      scope: `Signal ${input.event.provider}:${input.event.externalId}`,
      allowedPaths: JSON.stringify(["**/*"]),
      acceptanceCriteria: JSON.stringify([
        `Resolves signal ${input.event.provider}/${input.event.externalId}`,
        "PR opens with evidence",
      ]),
      estimateMicros,
      estimateComplexity: input.event.provider === "pagerduty" ? "S" : "S",
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.task_create",
    targetType: "task",
    targetId: task!.id,
    meta: {
      signalId: input.event.id,
      provider: input.event.provider,
      profileKeys: input.profileKeys,
      profileHint: profile,
    },
  });

  return task!;
}

export async function armSignalEvent(
  db: Database,
  input: {
    workspaceId: string;
    signalId: string;
    actor: string;
    projectId?: string | null;
    armArena?: boolean;
    profileKeys?: string[];
  },
): Promise<{ event: SignalEvent; task: Task }> {
  const event = await getSignalEvent(db, input.workspaceId, input.signalId);
  if (!event) throw new SignalError("not_found", "signal not found");
  if (event.status === "armed" && event.taskId) {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, event.taskId))
      .limit(1);
    if (task) return { event, task };
  }

  const envelope: SignalEnvelopeInput = {
    provider: event.provider,
    externalId: event.externalId,
    fingerprint: event.fingerprint,
    severity: event.severity,
    title: event.title,
    body: event.body,
    repoHint: event.repoHint,
    urls: parseJsonArray(event.urlsJson),
    labels: parseJsonArray(event.labelsJson),
  };

  const projectId =
    input.projectId ??
    event.projectId ??
    (await resolveProjectId(db, input.workspaceId, envelope, null));
  if (!projectId) {
    throw new SignalError(
      "invalid",
      "no project resolved for signal — connect a repo or set projectId",
    );
  }

  const profileKeys = resolveSpawnProfileKeys(
    event.provider,
    input.profileKeys,
  );

  const task = await createTaskFromSignal(db, {
    workspaceId: input.workspaceId,
    projectId,
    event,
    actor: input.actor,
    profileKeys,
  });

  if (input.armArena !== false) {
    await applySpawnProfilesToArena(db, {
      workspaceId: input.workspaceId,
      projectId,
      actor: input.actor,
      profileKeys,
    });
  }

  const submitted = await submitTaskForApproval(db, {
    workspaceId: input.workspaceId,
    taskId: task.id,
    actor: input.actor,
  });

  const [updated] = await db
    .update(signalEvents)
    .set({
      status: "armed",
      projectId,
      taskId: submitted.task.id,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(signalEvents.id, event.id))
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.arm",
    targetType: "signal_event",
    targetId: event.id,
    meta: {
      taskId: submitted.task.id,
      autoQueued: Boolean(submitted.autoQueued),
      armArena: input.armArena ?? true,
      provider: event.provider,
    },
  });

  void notifyWorkspace(db, {
    event: "signal_armed",
    workspaceId: input.workspaceId,
    projectId,
    taskId: submitted.task.id,
    message: `Signal armed: ${event.provider} — ${event.title}`,
    meta: { signalId: event.id, provider: event.provider },
  }).catch(() => undefined);

  return { event: updated!, task: submitted.task };
}

export async function dismissSignalEvent(
  db: Database,
  input: { workspaceId: string; signalId: string; actor: string },
): Promise<SignalEvent> {
  const [updated] = await db
    .update(signalEvents)
    .set({
      status: "ignored",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(signalEvents.id, input.signalId),
        eq(signalEvents.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!updated) throw new SignalError("not_found", "signal not found");
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.dismiss",
    targetType: "signal_event",
    targetId: updated.id,
    meta: {},
  });
  return updated;
}

/** Resolve workspace ids that have a repo matching full name (CI reverse path). */
export async function findWorkspacesForRepo(
  db: Database,
  repoFullName: string,
): Promise<{ workspaceId: string; projectId: string }[]> {
  const rows = await db
    .select({
      workspaceId: repositoryConnections.workspaceId,
      projectId: repositoryConnections.projectId,
    })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.baseRepoFullName, repoFullName));
  return rows
    .filter((r): r is { workspaceId: string; projectId: string } =>
      Boolean(r.projectId),
    )
    .map((r) => ({
      workspaceId: r.workspaceId,
      projectId: r.projectId!,
    }));
}

/** Record outbound sync attempt (audit only — never throws for PR path). */
export async function recordSignalOutbound(
  db: Database,
  input: {
    workspaceId: string;
    signalId: string;
    action: string;
    ok: boolean;
    note?: string;
    prUrl?: string | null;
  },
): Promise<void> {
  try {
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: "system:signal",
      action: "signal.outbound",
      targetType: "signal_event",
      targetId: input.signalId,
      meta: {
        outboundAction: input.action,
        ok: input.ok,
        note: input.note ?? null,
        prUrl: input.prUrl ?? null,
      },
    });
  } catch {
    /* never block */
  }
}

/** Ensure a default high-severity auto-arm rule exists for a provider. */
export async function ensureDefaultAutoArmRule(
  db: Database,
  input: {
    workspaceId: string;
    provider: string;
    actor: string;
    profileKeys?: string[];
  },
): Promise<AutoArmRule> {
  const existing = await listAutoArmRules(db, input.workspaceId);
  const hit = existing.find(
    (r) => r.provider === input.provider && r.enabled,
  );
  if (hit) return hit;
  return upsertAutoArmRule(db, {
    workspaceId: input.workspaceId,
    provider: input.provider,
    minSeverity: "high",
    armArena: true,
    profileKeys: input.profileKeys ?? ["fixer"],
    actor: input.actor,
  });
}

/** Count recent ingests for naive rate limiting. */
export async function countRecentSignalIngests(
  db: Database,
  workspaceId: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.workspaceId, workspaceId),
        gte(signalEvents.receivedAt, since),
      ),
    );
  return row?.count ?? 0;
}

/** TASK124 — per-provider flood shed (ban provider storms). */
export async function countRecentSignalIngestsByProvider(
  db: Database,
  workspaceId: string,
  provider: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.workspaceId, workspaceId),
        eq(signalEvents.provider, provider),
        gte(signalEvents.receivedAt, since),
      ),
    );
  return row?.count ?? 0;
}

export const SIGNAL_INGEST_LIMITS = {
  workspacePerMinute: 120,
  providerPerMinute: 60,
  armPerMinute: 30,
} as const;

export function evaluateIngestQuota(input: {
  workspaceCount: number;
  providerCount: number;
  workspaceLimit?: number;
  providerLimit?: number;
}): { ok: true } | { ok: false; reason: "workspace_quota" | "provider_storm" } {
  const wsLimit = input.workspaceLimit ?? SIGNAL_INGEST_LIMITS.workspacePerMinute;
  const pLimit = input.providerLimit ?? SIGNAL_INGEST_LIMITS.providerPerMinute;
  if (input.workspaceCount >= wsLimit) {
    return { ok: false, reason: "workspace_quota" };
  }
  if (input.providerCount >= pLimit) {
    return { ok: false, reason: "provider_storm" };
  }
  return { ok: true };
}
