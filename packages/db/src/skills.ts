import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  agentProfiles,
  agentSkills,
  type AgentSkill,
} from "./schema.js";

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
      "- If you change any `package.json` dependencies/devDependencies, run the package manager and commit the lockfile (`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock`). CI uses frozen lockfiles; missing lockfile updates fail delivery.",
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
  {
    key: "product-cpo",
    title: "Product CPO",
    bodyMarkdown: [
      "# Product CPO",
      "",
      "Build less. Solve more. Prefer simplifying existing workflows over new surfaces.",
      "",
      "## Cycle",
      "1. Discover real user friction (Playwright/code/docs).",
      "2. Name the outcome and smallest complete slice.",
      "3. Implement end-to-end (UI + API + tests + empty/error states).",
      "4. Verify the user can finish the journey without operator help.",
      "",
      "## Hard rules",
      "- No placeholder/scaffold features; a feature is done when the outcome works.",
      "- Prefer defaults over new settings screens.",
      "- Do not invent testimonials, metrics, or paid SKUs.",
      "- Public pricing stays Community / self-host $0 only.",
      "- Preserve architecture conventions; avoid speculative rewrites.",
    ].join("\n"),
  },
  {
    key: "designer-ux",
    title: "Designer UX",
    bodyMarkdown: [
      "# Designer UX",
      "",
      "Premium, minimal SaaS craft — Linear/Vercel/Stripe-level clarity without copying.",
      "",
      "## Cycle",
      "Explore → analyze hierarchy/spacing → redesign → implement → verify visually → refine.",
      "",
      "## Prioritize",
      "- Strong typography and spacing; one job per section.",
      "- Consistent tokens/components; reduce noise and card clutter.",
      "- Empty/loading/error states and mobile layouts.",
      "- Purposeful motion only; no generic purple-glow AI dashboards.",
      "",
      "## Hard rules",
      "- Improve UX, not decoration. Keep backend changes out of scope unless required.",
      "- Shared component fixes should lift related pages.",
    ].join("\n"),
  },
  {
    key: "landing-cro",
    title: "Landing CRO",
    bodyMarkdown: [
      "# Landing CRO",
      "",
      "Marketing/public pages: persuasion + conversion without paid-plan CTAs.",
      "",
      "## Focus",
      "- Hero value prop, hierarchy, storytelling, CTAs (header → final).",
      "- One primary CTA per page; secondary only when meaningful.",
      "- Trust/clarity; accurate destinations; mobile + a11y.",
      "",
      "## Hard rules",
      "- Community / self-host $0 only — never add Starter $99 / Pro $199 plan cards or checkout.",
      "- Do not invent social proof or fake product capabilities.",
      "- Optimize CTA purpose/placement; do not spam buttons.",
    ].join("\n"),
  },
  {
    key: "seo-growth",
    title: "SEO growth",
    bodyMarkdown: [
      "# SEO growth",
      "",
      "Technical SEO + discoverability for public routes.",
      "",
      "## Cycle",
      "Crawl/audit → prioritize → fix metadata/structure → validate → log briefly.",
      "",
      "## Prioritize",
      "- Unique titles/descriptions, canonicals, robots, sitemap honesty.",
      "- Semantic headings; SSR/HTML for indexable content.",
      "- Valid structured data that matches visible content.",
      "- Internal links; no indexing of auth/private pages.",
      "",
      "## Hard rules",
      "- Improve existing pages before thin new content.",
      "- Never invent rankings, traffic, or certifications.",
      "- Do not sacrifice UX for keyword stuffing.",
    ].join("\n"),
  },
  {
    key: "qa-explore",
    title: "QA explore",
    bodyMarkdown: [
      "# QA explore",
      "",
      "Act as user + engineer: explore, break, fix, verify.",
      "",
      "## Cycle",
      "Explore app/API → prioritize impact → implement → run tests → visual verify → repeat.",
      "",
      "## Focus",
      "- Functional bugs, reliability, UX friction, inconsistent states.",
      "- Prefer regression tests with the fix.",
      "",
      "## Hard rules",
      "- Fix, do not only report. Safe reversible changes only.",
      "- No production data destruction or unauthorized deploy.",
    ].join("\n"),
  },
  {
    key: "security-asvs",
    title: "Security ASVS",
    bodyMarkdown: [
      "# Security ASVS",
      "",
      "AuthZ, tenant isolation, injection, secrets, agent/tool boundaries.",
      "",
      "## Cycle",
      "Discover → validate safely → prioritize severity → fix root cause → regression test → harden.",
      "",
      "## Prioritize",
      "- Broken access control / IDOR; CSRF; SSRF; secret leakage.",
      "- Multi-tenant isolation; least privilege for agents/sandbox.",
      "- Prompt injection and approval bypasses.",
      "",
      "## Hard rules",
      "- Authorized local/staging only for active testing.",
      "- No destructive testing, secret exposure, or security-through-obscurity.",
      "- Prefer minimal well-tested fixes over rewrites.",
    ].join("\n"),
  },
  {
    key: "agent-reliability",
    title: "Agent reliability",
    bodyMarkdown: [
      "# Agent reliability",
      "",
      "Treat agent runs as failure-prone distributed workflows.",
      "",
      "## Cycle",
      "Discover → analyze → reproduce safely → fix → test → observe → log in docs/RELIABILITY_LOG.md.",
      "",
      "## Prioritize",
      "- Explicit state transitions; no success without verification.",
      "- Bounded retries; no duplicate non-idempotent side effects.",
      "- Lease/ownership, cancel/resume, stall/deadlock prevention.",
      "- Quota/billing fail-closed; cost visibility.",
      "",
      "## Hard rules",
      "- Human approval gates must not be bypassed.",
      "- No expensive prod agent storms or secret/config deploys without authorization.",
      "- Evidence before claiming reliability wins.",
    ].join("\n"),
  },
] as const;

/** Role-prompt skills for Coppergate self-pilot (capped ≤4 keys at prompt load). */
export const DEFAULT_PROFILE_SKILL_KEYS: Record<string, string[]> = {
  engineer: ["pr-hygiene", "designer-ux", "landing-cro"],
  proposer: ["product-cpo", "pr-hygiene"],
  fixer: ["agent-reliability", "pr-hygiene", "sonar-remediation"],
  security: ["security-asvs", "sonar-remediation", "pr-hygiene"],
  community: ["good-first-issue-writer"],
  docs: ["seo-growth", "pr-hygiene"],
  qa: ["qa-explore", "pr-hygiene"],
  reviewer: ["agent-reliability", "pr-hygiene"],
  release: ["pr-hygiene"],
  triager: ["good-first-issue-writer", "product-cpo"],
  perf: ["pr-hygiene", "agent-reliability"],
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
      if (
        hit.title !== seed.title ||
        hit.bodyMarkdown !== seed.bodyMarkdown
      ) {
        const [updated] = await db
          .update(agentSkills)
          .set({
            title: seed.title,
            bodyMarkdown: seed.bodyMarkdown,
            version: (hit.version ?? 1) + 1,
            updatedAt: now,
          })
          .where(eq(agentSkills.id, hit.id))
          .returning();
        out.push(updated ?? hit);
      } else {
        out.push(hit);
      }
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

const SYSTEM_SKILL_KEYS: Set<string> = new Set(
  SYSTEM_SKILL_SEEDS.map((s) => s.key as string),
);

/**
 * Delete workspace skill row — resets system override or removes custom skill.
 * Also strips the key from workspace profile skillKeysJson.
 */
export async function deleteWorkspaceSkill(
  db: Database,
  input: { workspaceId: string; key: string; actor: string },
): Promise<{ deleted: boolean; resetToSystem: boolean }> {
  const key = input.key.trim().toLowerCase().replace(/\s+/g, "-");
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
  if (!existing) {
    throw new Error("workspace skill not found");
  }

  const profiles = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.workspaceId, input.workspaceId));
  const now = new Date();
  for (const profile of profiles) {
    const keys = parseSkillKeysJson(profile.skillKeysJson);
    if (!keys.includes(key)) continue;
    const next = keys.filter((k) => k !== key);
    await db
      .update(agentProfiles)
      .set({ skillKeysJson: JSON.stringify(next), updatedAt: now })
      .where(eq(agentProfiles.id, profile.id));
  }

  await db.delete(agentSkills).where(eq(agentSkills.id, existing.id));
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: SYSTEM_SKILL_KEYS.has(key) ? "skill.reset" : "skill.delete",
    targetType: "agent_skill",
    targetId: existing.id,
    meta: { key },
  });
  return { deleted: true, resetToSystem: SYSTEM_SKILL_KEYS.has(key) };
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
