import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  DEFAULT_CONTENDER_BUDGET_MICROS,
  ensureArenaForProject,
  isContenderStrategy,
  MAX_TOURNAMENT_FANOUT,
} from "./arena.js";
import { getLlmByokById } from "./credentials.js";
import {
  agentProfiles,
  arenas,
  contenders,
  type AgentProfile,
  type AgentTemperament,
} from "./schema.js";
import { DEFAULT_PROFILE_SKILL_KEYS } from "./skills.js";
import {
  defaultTemperamentForProfileKey,
  isAgentTemperament,
  strategyForTemperament,
} from "./temperament.js";

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
    temperament?: AgentTemperament;
    skillKeys?: string[];
    maxSpendMicros?: number;
    toolAllowlist?: string[];
    llmCredentialId?: string | null;
    preferredModel?: string | null;
  },
): Promise<AgentProfile> {
  if (!BOUNDED_KEYS.has(input.key)) {
    throw new ProfileError("invalid", `profile key not in bounded catalog`);
  }
  const allowedTools = new Set([
    "read",
    "edit",
    "test",
    "git",
    "mcp:sonarqube",
    "mcp:*",
  ]);
  if (input.toolAllowlist) {
    for (const t of input.toolAllowlist) {
      if (!allowedTools.has(t) && !t.startsWith("sonar_")) {
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
  if (input.temperament && !isAgentTemperament(input.temperament)) {
    throw new ProfileError("invalid", "invalid temperament");
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
      strategyDefault:
        nextStrategy ?? input.strategyDefault ?? system.strategyDefault,
      temperament:
        nextTemperament ??
        (isAgentTemperament(system.temperament)
          ? system.temperament
          : defaultTemperamentForProfileKey(input.key)),
      skillKeysJson:
        input.skillKeys !== undefined
          ? JSON.stringify(input.skillKeys)
          : system.skillKeysJson ||
            JSON.stringify(DEFAULT_PROFILE_SKILL_KEYS[input.key] ?? []),
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
 * Inserts missing ACTIVE contenders per key; eliminates ACTIVE slots whose
 * profileKey is not in the requested set (e.g. engineer_2 clones).
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
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const k of input.profileKeys) {
    if (!BOUNDED_KEYS.has(k) || seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
  }
  if (keys.length === 0) return;

  await ensureSystemAgentProfiles(db);
  const profiles = await listAgentProfiles(db, input.workspaceId);
  const byKey = new Map(profiles.map((p) => [p.key, p]));

  const n = Math.min(MAX_TOURNAMENT_FANOUT, Math.max(keys.length, 1));
  const { arena, contenders: pool } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    defaultContenderN: n,
    contenderCount: n,
  });

  const now = new Date();
  const active = pool.filter((c) => c.status === "ACTIVE");
  const byProfile = new Map<string, (typeof active)[number]>();
  const wanted = new Set(keys);

  for (const c of active) {
    const keep =
      wanted.has(c.profileKey) && !byProfile.has(c.profileKey);
    if (keep) {
      byProfile.set(c.profileKey, c);
      continue;
    }
    // Orphan clones (engineer_2), duplicate keys, or keys dropped from roster
    await db
      .update(contenders)
      .set({
        status: "ELIMINATED",
        eliminatedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(contenders.id, c.id), eq(contenders.arenaId, arena.id)),
      );
  }

  for (const key of keys) {
    const profile = byKey.get(key);
    const rawStrategy = profile?.strategyDefault ?? "balanced";
    const strategy = isContenderStrategy(rawStrategy) ? rawStrategy : "balanced";
    const existing = byProfile.get(key);
    if (existing) {
      await db
        .update(contenders)
        .set({
          profileKey: key,
          strategy,
          updatedAt: now,
        })
        .where(
          and(eq(contenders.id, existing.id), eq(contenders.arenaId, arena.id)),
        );
      continue;
    }
    await db.insert(contenders).values({
      id: crypto.randomUUID(),
      arenaId: arena.id,
      workspaceId: input.workspaceId,
      profileKey: key,
      strategy,
      budgetMicrosRemaining: DEFAULT_CONTENDER_BUDGET_MICROS,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Keep arena defaultContenderN aligned with the live roster width.
  await db
    .update(arenas)
    .set({ defaultContenderN: n, updatedAt: now })
    .where(
      and(eq(arenas.id, arena.id), eq(arenas.workspaceId, input.workspaceId)),
    );

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "signal.spawn_profiles",
    targetType: "arena",
    targetId: arena.id,
    meta: { profileKeys: keys, projectId: input.projectId },
  });
}
