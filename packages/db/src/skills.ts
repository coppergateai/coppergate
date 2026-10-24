import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import { agentSkills, type AgentSkill } from "./schema.js";

export const SYSTEM_SKILL_SEEDS = [
  {
    key: "pr-hygiene",
    title: "PR hygiene",
    bodyMarkdown: [
      "# PR hygiene",
      "",
      "When to use: before opening or updating a PR.",
      "",
      "- Title describes a user-visible capability, not scaffold/typo.",
      "- Keep blast radius small; include a test or validation note.",
      "- Update CHANGELOG/docs when user-visible.",
    ].join("\n"),
  },
  {
    key: "good-first-issue-writer",
    title: "Good first issue writer",
    bodyMarkdown: [
      "# Good first issue writer",
      "",
      "When to use: drafting community issues.",
      "",
      "- One concrete slice; clear acceptance checkboxes.",
      "- Label good first issue + help wanted.",
      "- No secrets; no unbounded rewrites.",
    ].join("\n"),
  },
  {
    key: "go-test",
    title: "Go test",
    bodyMarkdown: [
      "# Go test",
      "",
      "When to use: Go code changes.",
      "",
      "- Prefer `go test ./...` for the touched package tree.",
      "- Add a focused regression test with the fix.",
    ].join("\n"),
  },
  {
    key: "sonar-remediation",
    title: "Sonar remediation",
    bodyMarkdown: [
      "# Sonar remediation",
      "",
      "When to use: SonarQube / SAST findings.",
      "",
      "- Fix the reported rule with minimal blast radius.",
      "- Do not weaken auth or expand attack surface.",
      "- Prefer mcp:sonarqube tools when connected.",
    ].join("\n"),
  },
] as const;

export const DEFAULT_PROFILE_SKILL_KEYS: Record<string, string[]> = {
  engineer: ["pr-hygiene", "go-test"],
  proposer: ["pr-hygiene"],
  fixer: ["pr-hygiene", "sonar-remediation"],
  security: ["sonar-remediation", "pr-hygiene"],
  community: ["good-first-issue-writer"],
  docs: ["pr-hygiene"],
  qa: ["pr-hygiene", "go-test"],
  reviewer: ["pr-hygiene"],
  release: ["pr-hygiene"],
  triager: ["good-first-issue-writer"],
  perf: ["pr-hygiene"],
};

export function parseSkillKeysJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export async function ensureSystemAgentSkills(
  db: Database,
): Promise<AgentSkill[]> {
  const existing = await db
    .select()
    .from(agentSkills)
    .where(isNull(agentSkills.workspaceId));
  const byKey = new Map(existing.map((s) => [s.key, s]));
  const now = new Date();
  const out: AgentSkill[] = [];
  for (const seed of SYSTEM_SKILL_SEEDS) {
    const hit = byKey.get(seed.key);
    if (hit) {
      out.push(hit);
      continue;
    }
    const [created] = await db
      .insert(agentSkills)
      .values({
        id: crypto.randomUUID(),
        workspaceId: null,
        key: seed.key,
        title: seed.title,
        bodyMarkdown: seed.bodyMarkdown,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    out.push(created!);
  }
  return out;
}

export async function listAgentSkills(
  db: Database,
  workspaceId?: string | null,
): Promise<AgentSkill[]> {
  await ensureSystemAgentSkills(db);
  if (!workspaceId) {
    return db
      .select()
      .from(agentSkills)
      .where(isNull(agentSkills.workspaceId))
      .orderBy(asc(agentSkills.key));
  }
  return db
    .select()
    .from(agentSkills)
    .where(
      or(
        isNull(agentSkills.workspaceId),
        eq(agentSkills.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(agentSkills.key));
}

/** Workspace override wins over system for a skill key. */
export async function getEffectiveAgentSkill(
  db: Database,
  workspaceId: string,
  key: string,
): Promise<AgentSkill | null> {
  await ensureSystemAgentSkills(db);
  const [ws] = await db
    .select()
    .from(agentSkills)
    .where(
      and(eq(agentSkills.workspaceId, workspaceId), eq(agentSkills.key, key)),
    )
    .limit(1);
  if (ws) return ws;
  const [sys] = await db
    .select()
    .from(agentSkills)
    .where(and(isNull(agentSkills.workspaceId), eq(agentSkills.key, key)))
    .limit(1);
  return sys ?? null;
}

const MAX_SKILLS_IN_PROMPT = 4;
const MAX_SKILL_CHARS = 6_000;

/**
 * Load skill bodies for a profile; capped for prompt budget.
 */
export async function loadSkillsForPrompt(
  db: Database,
  workspaceId: string,
  skillKeys: string[],
): Promise<string> {
  const keys = skillKeys.slice(0, MAX_SKILLS_IN_PROMPT);
  const chunks: string[] = [];
  let used = 0;
  for (const key of keys) {
    const skill = await getEffectiveAgentSkill(db, workspaceId, key);
    if (!skill?.bodyMarkdown?.trim()) continue;
    const block = `### Skill: ${skill.title} (${skill.key} v${skill.version})\n${skill.bodyMarkdown.trim()}`;
    if (used + block.length > MAX_SKILL_CHARS) break;
    chunks.push(block);
    used += block.length;
  }
  if (!chunks.length) return "";
  return `## Assigned skills\n\n${chunks.join("\n\n")}`;
}

export async function upsertWorkspaceSkill(
  db: Database,
  input: {
    workspaceId: string;
    key: string;
    title: string;
    bodyMarkdown: string;
    actor: string;
  },
): Promise<AgentSkill> {
  const key = input.key.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(key)) {
    throw new Error("invalid skill key");
  }
  const now = new Date();
  const [existing] = await db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.workspaceId, input.workspaceId),
        eq(agentSkills.key, key),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(agentSkills)
      .set({
        title: input.title.trim().slice(0, 120),
        bodyMarkdown: input.bodyMarkdown.slice(0, 20_000),
        version: existing.version + 1,
        updatedAt: now,
      })
      .where(eq(agentSkills.id, existing.id))
      .returning();
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "skill.update",
      targetType: "agent_skill",
      targetId: updated!.id,
      meta: { key },
    });
    return updated!;
  }

  const [created] = await db
    .insert(agentSkills)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      key,
      title: input.title.trim().slice(0, 120),
      bodyMarkdown: input.bodyMarkdown.slice(0, 20_000),
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "skill.create",
    targetType: "agent_skill",
    targetId: created!.id,
    meta: { key },
  });
  return created!;
}

/**
 * Self-improve: append a tip to skill body (versioned).
 */
export async function evolveSkill(
  db: Database,
  input: {
    workspaceId: string;
    key: string;
    tip: string;
    runId?: string | null;
    actor: string;
  },
): Promise<AgentSkill | null> {
  const base = await getEffectiveAgentSkill(db, input.workspaceId, input.key);
  if (!base) return null;
  const tip = input.tip.trim().slice(0, 500);
  if (!tip) return base;
  if (base.bodyMarkdown.includes(tip.slice(0, 40))) return base;

  const now = new Date();
  const [existing] = await db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.workspaceId, input.workspaceId),
        eq(agentSkills.key, input.key),
      ),
    )
    .limit(1);

  const nextBody = `${base.bodyMarkdown.trim()}\n\n## Learned\n- ${tip}`.slice(
    0,
    20_000,
  );

  if (existing) {
    const [updated] = await db
      .update(agentSkills)
      .set({
        bodyMarkdown: nextBody,
        version: existing.version + 1,
        parentSkillId: existing.parentSkillId ?? existing.id,
        evolvedFromRunId: input.runId ?? null,
        updatedAt: now,
      })
      .where(eq(agentSkills.id, existing.id))
      .returning();
    return updated ?? null;
  }

  const [created] = await db
    .insert(agentSkills)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      key: input.key,
      title: base.title,
      bodyMarkdown: nextBody,
      version: base.version + 1,
      parentSkillId: base.id,
      evolvedFromRunId: input.runId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "skill.evolve",
    targetType: "agent_skill",
    targetId: created!.id,
    meta: { key: input.key, runId: input.runId ?? null },
  });
  return created!;
}
