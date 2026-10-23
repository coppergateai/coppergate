#!/usr/bin/env node
/**
 * Verify workspace BYOK decrypts with CREDENTIALS_ENCRYPTION_KEY,
 * then enable maintainer at $50/mo on kprompt + kprompt-website.
 */
import {
  closeDb,
  createDb,
  enableMaintainerMode,
  getDefaultLlmByok,
  getProjectSpendSummary,
  listProjectsForWorkspace,
  workspaces,
} from "../packages/db/src/index.ts";
import { openSecret, parseEncryptionKey } from "../packages/github/src/index.ts";

const budgetMicros = Number(process.env.MAINTAINER_BUDGET_MICROS ?? "50000000");
const actor = process.env.DOGFOOD_ACTOR ?? "script:ops-raise-budget-byok";
const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
const targetNames = (
  process.env.TARGET_PROJECTS ?? "kprompt,kprompt-website"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  const wsRows = await db.select().from(workspaces);
  const ws = wsRows.find((w) => w.slug === slug);
  if (!ws) throw new Error(`workspace slug=${slug} not found`);

  const byok = await getDefaultLlmByok(db, ws.id);
  if (!byok?.encryptedPayload) {
    throw new Error("No default LLM BYOK on workspace");
  }
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!keyHex) throw new Error("CREDENTIALS_ENCRYPTION_KEY missing");
  const apiKey = openSecret(byok.encryptedPayload, parseEncryptionKey(keyHex));
  if (!apiKey || apiKey.length < 10) {
    throw new Error("BYOK decrypt produced empty key");
  }

  const listed = await listProjectsForWorkspace(db, ws.id);
  // listProjects may only return primary — also scan via enable targets by name
  // from a raw select through listed + fallback names
  let targets = listed.filter(
    (p) =>
      targetNames.includes(p.project.name) ||
      targetNames.includes(p.repository.baseRepoFullName.split("/")[1] ?? ""),
  );

  // If website missing from listProjects, look up by scanning workspaces projects table via SQL helper
  if (targets.length < targetNames.length) {
    const { projects } = await import("../packages/db/src/schema.ts");
    const { eq } = await import("drizzle-orm");
    const all = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, ws.id));
    const byName = new Map(all.map((p) => [p.name, p]));
    targets = targetNames
      .map((name) => {
        const hit = listed.find((p) => p.project.name === name);
        if (hit) return hit;
        const row = byName.get(name);
        if (!row) return null;
        return { project: row, repository: { baseRepoFullName: name } };
      })
      .filter(Boolean);
  }

  if (targets.length === 0) {
    throw new Error(`No matching projects: ${targetNames.join(", ")}`);
  }

  const results = [];
  for (const t of targets) {
    const { project, policy } = await enableMaintainerMode(db, {
      workspaceId: ws.id,
      projectId: t.project.id,
      actor,
      policy: {
        monthlyBudgetMicros: budgetMicros,
        autoMerge: true,
        autoRelease: true,
        selfImprove: true,
        continuousBacklog: true,
        autoQueueReplanTasks: true,
        maxAutoQueuePerReplan: 2,
        maxTournamentN: 2,
      },
    });
    let spend = null;
    try {
      spend = await getProjectSpendSummary(db, {
        workspaceId: ws.id,
        projectId: project.id,
      });
    } catch {
      spend = null;
    }
    results.push({
      name: t.project.name,
      projectId: project.id,
      maintainerEnabled: project.maintainerEnabled,
      autonomyLevel: project.autonomyLevel,
      mergeEnabled: project.mergeEnabled,
      monthlyBudgetMicros: policy.monthlyBudgetMicros,
      capMicros: spend?.capMicros ?? null,
      availableMicros: spend?.availableMicros ?? null,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dbHost: new URL(url).hostname,
        workspaceId: ws.id,
        byokDecryptOk: true,
        byokLabel: byok.label,
        byokVendor: byok.vendor,
        byokModel: byok.model,
        results,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
