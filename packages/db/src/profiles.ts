import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  ensureArenaForProject,
  MAX_TOURNAMENT_FANOUT,
} from "./arena.js";
import { getLlmByokById } from "./credentials.js";
import {
  agentProfiles,
  contenders,
  type AgentProfile,
} from "./schema.js";

export class ProfileError extends Error {
  readonly code: "not_found" | "invalid" | "forbidden";
  constructor(code: ProfileError["code"], message: string) {
    super(message);
    this.name = "ProfileError";
    this.code = code;
  }
}

/** Bounded catalog — must stay aligned with @coppergate/signals PROFILE_CATALOG. */
export const SYSTEM_PROFILE_SEEDS = [
  {
    key: "fixer",
    displayName: "Fixer",
    promptGuidance:
      "Fix the reported bug or failure with minimal blast radius. Prefer tests that prove the fix.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "blitz",
    maxSpendMicros: 80_000,
  },
  {
    key: "engineer",
    displayName: "Engineer",
    promptGuidance:
      "Implement the feature or issue within scope and acceptance criteria. Keep diffs reviewable.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 120_000,
  },
  {
    key: "security",
    displayName: "Security",
    promptGuidance:
      "Remediate the vulnerability or SAST finding without weakening auth or expanding attack surface.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "fortress",
    maxSpendMicros: 100_000,
  },
  {
    key: "perf",
    displayName: "Perf",
    promptGuidance:
      "Improve performance within budget; measure before/after; avoid premature abstraction.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 100_000,
  },
  {
    key: "docs",
    displayName: "Docs",
    promptGuidance:
      "Update docs/OpenAPI/README to match code changes. Do not change runtime behavior.",
    toolAllowlist: ["read", "edit", "git"],
    strategyDefault: "balanced",
    maxSpendMicros: 40_000,
  },
  {
    key: "qa",
    displayName: "QA",
    promptGuidance:
      "Add or fix tests that catch the reported failure. Prefer deterministic assertions.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "fortress",
    maxSpendMicros: 60_000,
  },
] as const;

export const BOUNDED_KEYS: Set<string> = new Set(
  SYSTEM_PROFILE_SEEDS.map((s) => s.key as string),
);

export const DEFAULT_SPAWN_MATRIX: Record<string, string[]> = {
  fake: ["fixer"],
  sonar: ["fixer", "security"],
  ci_failure: ["fixer"],
  sentry: ["fixer"],
  datadog: ["fixer"],
  jira: ["engineer"],
  linear: ["engineer"],
  codeql: ["security", "fixer"],
  semgrep: ["security", "fixer"],
  dependabot: ["security"],
  trivy: ["security", "fixer"],
  pagerduty: ["fixer"],
  opsgenie: ["fixer"],
  bugsnag: ["fixer"],
  "*": ["fixer"],
};

export function resolveSpawnProfileKeys(
  provider: string,
  override?: string[] | null,
): string[] {
  if (override && override.length > 0) {
    const filtered = override.filter((k) => BOUNDED_KEYS.has(k));
    if (filtered.length > 0) return filtered;
  }
  return DEFAULT_SPAWN_MATRIX[provider] ?? DEFAULT_SPAWN_MATRIX["*"]!;
}

/** Seed system profiles (idempotent). */
export async function ensureSystemAgentProfiles(
  db: Database,
): Promise<AgentProfile[]> {
  const existing = await db
    .select()
    .from(agentProfiles)
    .where(isNull(agentProfiles.workspaceId));
  const byKey = new Map(existing.map((p) => [p.key, p]));
  const now = new Date();
  const out: AgentProfile[] = [];
  for (const seed of SYSTEM_PROFILE_SEEDS) {
    const hit = byKey.get(seed.key);
    if (hit) {
      out.push(hit);
      continue;
    }
    const [created] = await db
      .insert(agentProfiles)
      .values({
        id: crypto.randomUUID(),
        workspaceId: null,
        key: seed.key,
        displayName: seed.displayName,
        promptGuidance: seed.promptGuidance,
        toolAllowlistJson: JSON.stringify(seed.toolAllowlist),
        strategyDefault: seed.strategyDefault,
        maxSpendMicros: seed.maxSpendMicros,
        locked: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    out.push(created!);
  }
  return out;
}

export async function listAgentProfiles(
  db: Database,
  workspaceId?: string | null,
): Promise<AgentProfile[]> {
  await ensureSystemAgentProfiles(db);
  if (!workspaceId) {
    return db
      .select()
      .from(agentProfiles)
      .where(isNull(agentProfiles.workspaceId))
      .orderBy(asc(agentProfiles.key));
  }
  return db
    .select()
    .from(agentProfiles)
    .where(
      or(
        isNull(agentProfiles.workspaceId),
        eq(agentProfiles.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(agentProfiles.key));
}

/** Workspace override wins over system seed for a profile key. */
export async function getEffectiveAgentProfile(
  db: Database,
  workspaceId: string,
  key: string,
): Promise<AgentProfile | null> {
  if (!BOUNDED_KEYS.has(key)) return null;
  await ensureSystemAgentProfiles(db);
  const [override] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.workspaceId, workspaceId),
        eq(agentProfiles.key, key),
      ),
    )
    .limit(1);
  if (override) return override;
  const [system] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(isNull(agentProfiles.workspaceId), eq(agentProfiles.key, key)),
    )
    .limit(1);
  return system ?? null;
}

/**
 * Constrained profile editor — cannot add unbounded tools or raise autonomy (TASK103).
 */
export async function updateWorkspaceAgentProfile(
  db: Database,
  input: {
    workspaceId: string;
    key: string;
    actor: string;
    promptGuidance?: string;
    strategyDefault?: string;
    maxSpendMicros?: number;
    toolAllowlist?: string[];
    llmCredentialId?: string | null;
    preferredModel?: string | null;
  },
): Promise<AgentProfile> {
  if (!BOUNDED_KEYS.has(input.key)) {
    throw new ProfileError("invalid", `profile key not in bounded catalog`);
  }
  const allowedTools = new Set(["read", "edit", "test", "git"]);
  if (input.toolAllowlist) {
    for (const t of input.toolAllowlist) {
      if (!allowedTools.has(t)) {
        throw new ProfileError(
          "forbidden",
          `tool ${t} not allowed — cannot escalate tools`,
        );
      }
    }
  }
  if (
    input.strategyDefault &&
    !["balanced", "blitz", "fortress"].includes(input.strategyDefault)
  ) {
    throw new ProfileError("invalid", "invalid strategyDefault");
  }
  if (
    input.maxSpendMicros != null &&
    (!Number.isFinite(input.maxSpendMicros) || input.maxSpendMicros < 1)
  ) {
    throw new ProfileError("invalid", "maxSpendMicros must be positive");
  }

  if (input.llmCredentialId) {
    const cred = await getLlmByokById(
      db,
      input.workspaceId,
      input.llmCredentialId,
    );
    if (!cred) {
      throw new ProfileError("invalid", "llmCredentialId not found in workspace");
    }
  }

  await ensureSystemAgentProfiles(db);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.workspaceId, input.workspaceId),
        eq(agentProfiles.key, input.key),
      ),
    )
    .limit(1);

  const preferredModel =
    input.preferredModel === undefined
      ? undefined
      : input.preferredModel?.trim() || null;

  if (existing) {
    if (existing.locked) {
      throw new ProfileError("forbidden", "profile is locked");
    }
    const [updated] = await db
      .update(agentProfiles)
      .set({
        promptGuidance: input.promptGuidance ?? existing.promptGuidance,
        strategyDefault: input.strategyDefault ?? existing.strategyDefault,
        maxSpendMicros: input.maxSpendMicros ?? existing.maxSpendMicros,
        toolAllowlistJson:
          input.toolAllowlist !== undefined
            ? JSON.stringify(input.toolAllowlist)
            : existing.toolAllowlistJson,
        llmCredentialId:
          input.llmCredentialId === undefined
            ? existing.llmCredentialId
            : input.llmCredentialId,
        preferredModel:
          preferredModel === undefined
            ? existing.preferredModel
            : preferredModel,
        updatedAt: now,
      })
      .where(eq(agentProfiles.id, existing.id))
      .returning();
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "profile.update",
      targetType: "agent_profile",
      targetId: updated!.id,
      meta: { key: input.key },
    });
    return updated!;
  }

  const system = (await listAgentProfiles(db)).find((p) => p.key === input.key);
  if (!system) throw new ProfileError("not_found", "system profile missing");

  const [created] = await db
    .insert(agentProfiles)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      key: input.key,
      displayName: system.displayName,
      promptGuidance: input.promptGuidance ?? system.promptGuidance,
      toolAllowlistJson:
        input.toolAllowlist !== undefined
          ? JSON.stringify(input.toolAllowlist)
          : system.toolAllowlistJson,
      strategyDefault: input.strategyDefault ?? system.strategyDefault,
      maxSpendMicros: input.maxSpendMicros ?? system.maxSpendMicros,
      llmCredentialId: input.llmCredentialId ?? null,
      preferredModel: preferredModel ?? null,
      locked: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "profile.override",
    targetType: "agent_profile",
    targetId: created!.id,
    meta: { key: input.key },
  });
  return created!;
}

/**
 * Align arena contenders with spawn matrix profile keys before fan-out (TASK104).
 */
export async function applySpawnProfilesToArena(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    profileKeys: string[];
  },
): Promise<void> {
  const keys = input.profileKeys.filter((k) => BOUNDED_KEYS.has(k));
  if (keys.length === 0) return;

  await ensureSystemAgentProfiles(db);
  const profiles = await listAgentProfiles(db, input.workspaceId);
  const byKey = new Map(profiles.map((p) => [p.key, p]));

  const n = Math.min(MAX_TOURNAMENT_FANOUT, Math.max(keys.length, 2));
  const { arena, contenders: pool } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    defaultContenderN: n,
    contenderCount: n,
  });

  const active = pool.filter((c) => c.status === "ACTIVE");
  for (let i = 0; i < active.length; i++) {
    const key = keys[i % keys.length]!;
    const profile = byKey.get(key);
    const strategy = profile?.strategyDefault ?? "balanced";
    await db
      .update(contenders)
      .set({
        profileKey: key,
        strategy,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contenders.id, active[i]!.id),
          eq(contenders.arenaId, arena.id),
        ),
      );
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.spawn_profiles",
    targetType: "arena",
    targetId: arena.id,
    meta: { profileKeys: keys, projectId: input.projectId },
  });
}
