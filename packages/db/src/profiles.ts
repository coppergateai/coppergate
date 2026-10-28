import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  DEFAULT_CONTENDER_BUDGET_MICROS,
  ensureArenaForProject,
  ensurePeerContenderSeats,
  isContenderStrategy,
  MIN_DUEL_CONTENDERS,
  type ContenderStrategy,
} from "./arena.js";
import {
  primaryRoleForSpawn,
  strategiesForDuel,
  type PeerContenderStrategy,
} from "./contender-peers.js";
import { getLlmByokById } from "./credentials.js";
import {
  agentProfiles,
  type AgentProfile,
  type AgentTemperament,
} from "./schema.js";
import { DEFAULT_PROFILE_SKILL_KEYS } from "./skills.js";
import {
  defaultTemperamentForProfileKey,
  isAgentTemperament,
  strategyForTemperament,
} from "./temperament.js";
import { assertProfileToolAllowlist, ToolDefError } from "./tool-defs.js";

export function normalizeProfileKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isValidProfileKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(key);
}

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
      "Fix the reported bug or failure with focused blast radius and a regression test that proves the fix.",
    toolAllowlist: ["read", "edit", "test", "git", "mcp:sonarqube"],
    strategyDefault: "blitz" as const,
    temperament: "swift" as const,
    maxSpendMicros: 500_000,
  },
  {
    key: "engineer",
    displayName: "Engineer",
    promptGuidance:
      "Ship the acceptance criteria as a user-visible product increment with tests and docs when needed. For Go prefer go test ./.... Refuse scaffold stubs, typos, and empty structure PRs.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced" as const,
    temperament: "balanced" as const,
    maxSpendMicros: 2_000_000,
  },
  {
    key: "proposer",
    displayName: "Proposer",
    promptGuidance:
      "Select the next product increment from the vision or architecture Open IDs (P-/W-/A-/S-). Prefer capabilities with tests over bugs/docs-only. Output a scoped ship task, not a rewrite or typo.",
    toolAllowlist: ["read", "git"],
    strategyDefault: "balanced" as const,
    temperament: "balanced" as const,
    maxSpendMicros: 500_000,
  },
  {
    key: "reviewer",
    displayName: "Reviewer",
    promptGuidance:
      "Adversarial review: reject scope creep, missing tests, unsafe changes, and path-allowlist violations. Prefer fail-closed judgments with concrete fix notes.",
    toolAllowlist: ["read", "test", "git"],
    strategyDefault: "fortress" as const,
    temperament: "steady" as const,
    maxSpendMicros: 60_000,
  },
  {
    key: "security",
    displayName: "Security",
    promptGuidance:
      "Remediate the vulnerability or SAST finding without weakening auth or expanding attack surface.",
    toolAllowlist: ["read", "edit", "test", "git", "mcp:sonarqube"],
    strategyDefault: "fortress" as const,
    temperament: "steady" as const,
    maxSpendMicros: 100_000,
  },
  {
    key: "perf",
    displayName: "Perf",
    promptGuidance:
      "Improve performance within budget; measure before/after; avoid premature abstraction.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "balanced" as const,
    temperament: "balanced" as const,
    maxSpendMicros: 100_000,
  },
  {
    key: "docs",
    displayName: "Docs",
    promptGuidance:
      "Update docs/OpenAPI/README to match code changes. Do not change runtime behavior.",
    toolAllowlist: ["read", "edit", "git"],
    strategyDefault: "balanced" as const,
    temperament: "balanced" as const,
    maxSpendMicros: 40_000,
  },
  {
    key: "qa",
    displayName: "QA",
    promptGuidance:
      "Add or fix tests that catch the reported failure. Prefer deterministic assertions.",
    toolAllowlist: ["read", "edit", "test", "git"],
    strategyDefault: "fortress" as const,
    temperament: "steady" as const,
    maxSpendMicros: 60_000,
  },
  {
    key: "triager",
    displayName: "Triager",
    promptGuidance:
      "Triage issues and signals: severity, duplicate, effort band, labels. Prefer actionable next steps; do not expand scope.",
    toolAllowlist: ["read", "git"],
    strategyDefault: "blitz" as const,
    temperament: "swift" as const,
    maxSpendMicros: 40_000,
  },
  {
    key: "community",
    displayName: "Community",
    promptGuidance:
      "Reply helpfully on GitHub issues/Discussions. Stay on-topic, never share secrets, escalate security reports.",
    toolAllowlist: ["read"],
    strategyDefault: "balanced" as const,
    temperament: "balanced" as const,
    maxSpendMicros: 30_000,
  },
  {
    key: "release",
    displayName: "Release",
    promptGuidance:
      "Prepare changelog and release notes from merged work. Do not change runtime behavior outside version bump files.",
    toolAllowlist: ["read", "edit", "git"],
    strategyDefault: "fortress" as const,
    temperament: "steady" as const,
    maxSpendMicros: 50_000,
  },
] as const;

export const BOUNDED_KEYS: Set<string> = new Set(
  SYSTEM_PROFILE_SEEDS.map((s) => s.key as string),
);

/** Full sole-dev / maintainer arena roster (stable catalog order). */
export const FULL_ARENA_PROFILE_KEYS: string[] = SYSTEM_PROFILE_SEEDS.map(
  (s) => s.key as string,
);

export const DEFAULT_SPAWN_MATRIX: Record<string, string[]> = {
  fake: ["fixer"],
  sonar: ["fixer", "security"],
  ci_failure: ["fixer", "engineer"],
  sentry: ["fixer"],
  datadog: ["fixer"],
  jira: ["engineer", "proposer"],
  linear: ["engineer", "proposer"],
  github_issue: ["engineer", "proposer"],
  vision_replan: ["proposer", "engineer"],
  maintainer: ["engineer", "reviewer"],
  product_gap: ["proposer", "engineer"],
  ux_audit: ["qa", "engineer"],
  seo_audit: ["docs", "engineer"],
  landing_audit: ["engineer", "docs"],
  reliability: ["fixer", "reviewer"],
  codeql: ["security", "fixer"],
  semgrep: ["security", "fixer"],
  dependabot: ["security"],
  trivy: ["security", "fixer"],
  pagerduty: ["fixer"],
  opsgenie: ["fixer"],
  bugsnag: ["fixer"],
  "*": ["fixer", "engineer"],
};

export function resolveSpawnProfileKeys(
  provider: string,
  override?: string[] | null,
  /** Extra workspace-custom profile keys allowed in explicit overrides. */
  allowedExtraKeys?: Iterable<string> | null,
): string[] {
  const allowed = new Set(BOUNDED_KEYS);
  if (allowedExtraKeys) {
    for (const k of allowedExtraKeys) allowed.add(k);
  }
  if (override && override.length > 0) {
    const filtered = override.filter((k) => allowed.has(k));
    if (filtered.length > 0) return filtered;
  }
  return DEFAULT_SPAWN_MATRIX[provider] ?? DEFAULT_SPAWN_MATRIX["*"]!;
}

/** Merged effective catalog: system seeds + workspace overrides/customs. */
export async function listEffectiveAgentProfiles(
  db: Database,
  workspaceId: string,
): Promise<AgentProfile[]> {
  const rows = await listAgentProfiles(db, workspaceId);
  const byKey = new Map<string, AgentProfile>();
  for (const p of rows) {
    if (!p.workspaceId) {
      if (!byKey.has(p.key)) byKey.set(p.key, p);
    } else {
      byKey.set(p.key, p);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Workspace-only custom keys (not in the system bounded roster). */
export async function listCustomWorkspaceProfileKeys(
  db: Database,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.workspaceId, workspaceId));
  return rows.map((r) => r.key).filter((k) => !BOUNDED_KEYS.has(k));
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
    const skillKeys = DEFAULT_PROFILE_SKILL_KEYS[seed.key] ?? [];
    const skillKeysJson = JSON.stringify(skillKeys);
    if (hit) {
      // Keep locked system profiles aligned with DEFAULT_PROFILE_SKILL_KEYS.
      if (hit.locked && hit.skillKeysJson !== skillKeysJson) {
        const [updated] = await db
          .update(agentProfiles)
          .set({ skillKeysJson, updatedAt: now })
          .where(eq(agentProfiles.id, hit.id))
          .returning();
        out.push(updated ?? hit);
      } else {
        out.push(hit);
      }
      continue;
    }
    const temperament = seed.temperament;
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
        temperament,
        skillKeysJson,
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

/** Workspace override / custom wins over system seed for a profile key. */
export async function getEffectiveAgentProfile(
  db: Database,
  workspaceId: string,
  key: string,
): Promise<AgentProfile | null> {
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
  if (!BOUNDED_KEYS.has(key)) return null;
  const [system] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(isNull(agentProfiles.workspaceId), eq(agentProfiles.key, key)),
    )
    .limit(1);
  return system ?? null;
}

async function assertProfileExistsForUpdate(
  db: Database,
  workspaceId: string,
  key: string,
): Promise<{
  existing: AgentProfile | null;
  system: AgentProfile | null;
}> {
  await ensureSystemAgentProfiles(db);
  const [existing] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.workspaceId, workspaceId),
        eq(agentProfiles.key, key),
      ),
    )
    .limit(1);
  if (existing) return { existing, system: null };
  if (BOUNDED_KEYS.has(key)) {
    const system =
      (await listAgentProfiles(db)).find((p) => p.key === key) ?? null;
    return { existing: null, system };
  }
  throw new ProfileError(
    "not_found",
    "custom profile not found — create it first",
  );
}

/**
 * Create a workspace-custom agent (new key) or seed an override for a system key.
 */
export async function createWorkspaceAgentProfile(
  db: Database,
  input: {
    workspaceId: string;
    key: string;
    displayName: string;
    actor: string;
    promptGuidance?: string;
    strategyDefault?: string;
    temperament?: AgentTemperament;
    skillKeys?: string[];
    maxSpendMicros?: number;
    toolAllowlist?: string[];
  },
): Promise<AgentProfile> {
  const key = normalizeProfileKey(input.key);
  if (!isValidProfileKey(key)) {
    throw new ProfileError("invalid", "invalid profile key");
  }
  const displayName = input.displayName.trim().slice(0, 80);
  if (!displayName) {
    throw new ProfileError("invalid", "displayName required");
  }
  if (input.toolAllowlist) {
    try {
      await assertProfileToolAllowlist(
        db,
        input.workspaceId,
        input.toolAllowlist,
      );
    } catch (err) {
      if (err instanceof ToolDefError) {
        throw new ProfileError(err.code, err.message);
      }
      throw err;
    }
  }
  if (
    input.strategyDefault &&
    !["balanced", "blitz", "fortress"].includes(input.strategyDefault)
  ) {
    throw new ProfileError("invalid", "invalid strategyDefault");
  }
  if (input.temperament && !isAgentTemperament(input.temperament)) {
    throw new ProfileError("invalid", "invalid temperament");
  }
  if (
    input.maxSpendMicros != null &&
    (!Number.isFinite(input.maxSpendMicros) || input.maxSpendMicros < 1)
  ) {
    throw new ProfileError("invalid", "maxSpendMicros must be positive");
  }

  await ensureSystemAgentProfiles(db);
  const [existing] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.workspaceId, input.workspaceId),
        eq(agentProfiles.key, key),
      ),
    )
    .limit(1);
  if (existing) {
    throw new ProfileError("invalid", "profile already exists in workspace");
  }

  const system = BOUNDED_KEYS.has(key)
    ? ((await listAgentProfiles(db)).find((p) => p.key === key) ?? null)
    : null;

  const temperament: AgentTemperament =
    input.temperament ??
    (system && isAgentTemperament(system.temperament)
      ? system.temperament
      : "balanced");
  const strategyDefault =
    input.strategyDefault ??
    strategyForTemperament(temperament) ??
    system?.strategyDefault ??
    "balanced";
  const now = new Date();
  const [created] = await db
    .insert(agentProfiles)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      key,
      displayName,
      promptGuidance:
        input.promptGuidance ?? system?.promptGuidance ?? "",
      toolAllowlistJson:
        input.toolAllowlist !== undefined
          ? JSON.stringify(input.toolAllowlist)
          : (system?.toolAllowlistJson ??
            JSON.stringify(["read", "edit", "test", "git"])),
      strategyDefault,
      temperament,
      skillKeysJson:
        input.skillKeys !== undefined
          ? JSON.stringify(input.skillKeys)
          : (system?.skillKeysJson ||
            JSON.stringify(DEFAULT_PROFILE_SKILL_KEYS[key] ?? [])),
      maxSpendMicros:
        input.maxSpendMicros ?? system?.maxSpendMicros ?? 100_000,
      locked: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: BOUNDED_KEYS.has(key) ? "profile.override" : "profile.create",
    targetType: "agent_profile",
    targetId: created!.id,
    meta: { key },
  });
  return created!;
}

/**
 * Delete workspace profile row — resets system override or removes custom agent.
 */
export async function deleteWorkspaceAgentProfile(
  db: Database,
  input: { workspaceId: string; key: string; actor: string },
): Promise<{ deleted: boolean; resetToSystem: boolean }> {
  const key = normalizeProfileKey(input.key);
  const [existing] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.workspaceId, input.workspaceId),
        eq(agentProfiles.key, key),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new ProfileError("not_found", "workspace profile not found");
  }
  if (existing.locked) {
    throw new ProfileError("forbidden", "profile is locked");
  }
  await db.delete(agentProfiles).where(eq(agentProfiles.id, existing.id));
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: BOUNDED_KEYS.has(key) ? "profile.reset" : "profile.delete",
    targetType: "agent_profile",
    targetId: existing.id,
    meta: { key },
  });
  return { deleted: true, resetToSystem: BOUNDED_KEYS.has(key) };
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
    displayName?: string;
    promptGuidance?: string;
    strategyDefault?: string;
    temperament?: AgentTemperament;
    skillKeys?: string[];
    maxSpendMicros?: number;
    toolAllowlist?: string[];
    llmCredentialId?: string | null;
    preferredModel?: string | null;
  },
): Promise<AgentProfile> {
  const key = normalizeProfileKey(input.key);
  if (!isValidProfileKey(key)) {
    throw new ProfileError("invalid", "invalid profile key");
  }
  if (input.toolAllowlist) {
    try {
      await assertProfileToolAllowlist(
        db,
        input.workspaceId,
        input.toolAllowlist,
      );
    } catch (err) {
      if (err instanceof ToolDefError) {
        throw new ProfileError(err.code, err.message);
      }
      throw err;
    }
  }
  if (
    input.strategyDefault &&
    !["balanced", "blitz", "fortress"].includes(input.strategyDefault)
  ) {
    throw new ProfileError("invalid", "invalid strategyDefault");
  }
  if (input.temperament && !isAgentTemperament(input.temperament)) {
    throw new ProfileError("invalid", "invalid temperament");
  }
  if (
    input.maxSpendMicros != null &&
    (!Number.isFinite(input.maxSpendMicros) || input.maxSpendMicros < 1)
  ) {
    throw new ProfileError("invalid", "maxSpendMicros must be positive");
  }
  if (input.displayName !== undefined && !input.displayName.trim()) {
    throw new ProfileError("invalid", "displayName required");
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

  const { existing, system } = await assertProfileExistsForUpdate(
    db,
    input.workspaceId,
    key,
  );
  const now = new Date();

  const preferredModel =
    input.preferredModel === undefined
      ? undefined
      : input.preferredModel?.trim() || null;

  const nextTemperament: AgentTemperament | undefined = input.temperament;
  const nextStrategy =
    input.strategyDefault ??
    (nextTemperament ? strategyForTemperament(nextTemperament) : undefined);

  if (existing) {
    if (existing.locked) {
      throw new ProfileError("forbidden", "profile is locked");
    }
    const [updated] = await db
      .update(agentProfiles)
      .set({
        displayName:
          input.displayName !== undefined
            ? input.displayName.trim().slice(0, 80)
            : existing.displayName,
        promptGuidance: input.promptGuidance ?? existing.promptGuidance,
        strategyDefault: nextStrategy ?? existing.strategyDefault,
        temperament: nextTemperament ?? existing.temperament,
        skillKeysJson:
          input.skillKeys !== undefined
            ? JSON.stringify(input.skillKeys)
            : existing.skillKeysJson,
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
      meta: { key },
    });
    return updated!;
  }

  if (!system) throw new ProfileError("not_found", "system profile missing");

  const [created] = await db
    .insert(agentProfiles)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      key,
      displayName:
        input.displayName !== undefined
          ? input.displayName.trim().slice(0, 80)
          : system.displayName,
      promptGuidance: input.promptGuidance ?? system.promptGuidance,
      toolAllowlistJson:
        input.toolAllowlist !== undefined
          ? JSON.stringify(input.toolAllowlist)
          : system.toolAllowlistJson,
      strategyDefault:
        nextStrategy ?? input.strategyDefault ?? system.strategyDefault,
      temperament:
        nextTemperament ??
        (isAgentTemperament(system.temperament)
          ? system.temperament
          : defaultTemperamentForProfileKey(key)),
      skillKeysJson:
        input.skillKeys !== undefined
          ? JSON.stringify(input.skillKeys)
          : system.skillKeysJson ||
            JSON.stringify(DEFAULT_PROFILE_SKILL_KEYS[key] ?? []),
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
    meta: { key },
  });
  return created!;
}

/**
 * Arm peer-only contender seats for the primary spawn role.
 * Spawn matrix keys are role assignment (first key wins) — not duel partners.
 * Cross-role ACTIVE seats (and engineer_N clones) are eliminated.
 */
export async function applySpawnProfilesToArena(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    profileKeys: string[];
    /** Peer seat count; defaults to max(arena.defaultContenderN, MIN_DUEL). */
    seatCount?: number;
    /** Explicit strategies for peer seats (meta duel). */
    strategies?: ContenderStrategy[];
    /**
     * Legacy: per-key strategy hint. Only the primary key is honored as seat-0
     * preferred strategy; remaining seats flip via strategiesForDuel.
     */
    strategyByKey?: Record<string, ContenderStrategy>;
  },
): Promise<void> {
  await ensureSystemAgentProfiles(db);
  const effective = await listEffectiveAgentProfiles(db, input.workspaceId);
  const knownKeys = new Set(effective.map((p) => p.key));
  const primary = primaryRoleForSpawn(input.profileKeys, knownKeys);
  if (!knownKeys.has(primary)) return;

  const profile = effective.find((p) => p.key === primary);
  const preferredRaw =
    input.strategies?.[0] ??
    input.strategyByKey?.[primary] ??
    profile?.strategyDefault ??
    "balanced";
  const preferred: PeerContenderStrategy = isContenderStrategy(preferredRaw)
    ? preferredRaw
    : "balanced";

  const requestedSeats = Math.max(
    MIN_DUEL_CONTENDERS,
    arenaDefaultN(input.seatCount),
  );
  const { arena } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    defaultContenderN: requestedSeats,
    contenderCount: requestedSeats,
  });

  const seatCount = Math.max(
    MIN_DUEL_CONTENDERS,
    input.seatCount ??
      Math.max(arena.defaultContenderN, MIN_DUEL_CONTENDERS),
  );
  const strategies: ContenderStrategy[] =
    input.strategies && input.strategies.length > 0
      ? input.strategies.map((s) =>
          isContenderStrategy(s) ? s : preferred,
        )
      : (strategiesForDuel(seatCount, preferred) as ContenderStrategy[]);

  await ensurePeerContenderSeats(db, {
    workspaceId: input.workspaceId,
    arenaId: arena.id,
    profileKey: primary,
    strategies,
    budgetMicros: DEFAULT_CONTENDER_BUDGET_MICROS,
    pinDefaultContenderN: seatCount,
  });

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.spawn_profiles",
    targetType: "arena",
    targetId: arena.id,
    meta: {
      profileKeys: [primary],
      spawnHintKeys: input.profileKeys,
      primaryProfileKey: primary,
      strategies,
      projectId: input.projectId,
    },
  });
}

function arenaDefaultN(seatCount: number | undefined): number {
  if (seatCount != null && Number.isFinite(seatCount) && seatCount >= 1) {
    return Math.floor(seatCount);
  }
  return MIN_DUEL_CONTENDERS;
}
