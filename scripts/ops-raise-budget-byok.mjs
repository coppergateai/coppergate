#!/usr/bin/env node
/**
 * Verify workspace BYOK decrypts with CREDENTIALS_ENCRYPTION_KEY,
 * then set workspace pooled envelope ($100/mo default) and enable maintainer
 * on kprompt (+ website if present). Project budgets are paused by setWorkspaceBudget.
 */
import {
  DEFAULT_MONTHLY_BUDGET_MICROS,
  closeDb,
  createDb,
  enableMaintainerMode,
  getDefaultLlmByok,
  getProjectSpendSummary,
  getWorkspaceSpendSummary,
  listProjectsForWorkspace,
  setWorkspaceBudget,
  workspaces,
} from "../packages/db/src/index.ts";
import { openSecret, parseEncryptionKey } from "../packages/github/src/index.ts";

const budgetMicros = Number(
  process.env.MAINTAINER_BUDGET_MICROS ?? String(DEFAULT_MONTHLY_BUDGET_MICROS),
);
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
  const targets = listed.filter(
    (p) =>
      targetNames.includes(p.project.name) ||
      targetNames.includes(p.repository.baseRepoFullName.split("/")[1] ?? ""),
  );

  if (targets.length === 0) {
    throw new Error(
      `No matching projects: ${targetNames.join(", ")} (have: ${listed
        .map((p) => p.project.name)
        .join(", ")})`,
    );
  }

  const softAlert = Math.floor(budgetMicros * 0.8);
  const workspaceBudget = await setWorkspaceBudget(db, {
    workspaceId: ws.id,
    capMicros: budgetMicros,
    softAlertMicros: softAlert,
    actor,
    status: "active",
    period: "monthly",
    pauseProjectBudgets: true,
  });

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
      spend = await getProjectSpendSummary(db, ws.id, project.id);
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
      pooled: spend?.pooled ?? null,
      capMicros: spend?.capMicros ?? null,
      availableMicros: spend?.availableMicros ?? null,
      projectSpentMicros: spend?.projectSpentMicros ?? null,
    });
  }

  const wsSpend = await getWorkspaceSpendSummary(db, ws.id);

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
        workspaceBudget: {
          id: workspaceBudget.id,
          capMicros: workspaceBudget.capMicros,
          status: workspaceBudget.status,
          period: workspaceBudget.period,
          availableMicros: wsSpend?.availableMicros ?? null,
          spentMicros: wsSpend?.spentMicros ?? null,
        },
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
