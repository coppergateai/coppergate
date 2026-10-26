#!/usr/bin/env node
/**
 * Kprompt dogfood: budget + tiny brief + arm arena on the primary project.
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-ready-arena.mjs [--workspace-id UUID] [--primary-name kprompt]
 */
import {
  approveBrief,
  closeDb,
  createBriefDraft,
  createDb,
  ensureArenaForProject,
  getLatestBriefForProject,
  listProjectsForWorkspace,
  setProjectAutonomyLevel,
  setProjectBudget,
  workspaces,
} from "../packages/db/src/index.ts";

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const primaryName = (
  argValue("--primary-name") ??
  process.env.PRIMARY_NAME ??
  "kprompt"
).trim();
const budgetMicros = Number(process.env.DOGFOOD_BUDGET_MICROS ?? "50000000"); // $50
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-ready-arena";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

async function resolveWorkspaceId() {
  const fromArg = argValue("--workspace-id") ?? process.env.WORKSPACE_ID;
  if (fromArg) return fromArg;
  const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
  const rows = await db.select().from(workspaces);
  const row = rows.find((w) => w.slug === slug);
  if (!row) {
    throw new Error(`Workspace not found (slug=${slug})`);
  }
  return row.id;
}

function repoShortName(fullName) {
  const parts = fullName.split("/");
  return parts[parts.length - 1] ?? fullName;
}

try {
  const workspaceId = await resolveWorkspaceId();
  const projects = await listProjectsForWorkspace(db, workspaceId);
  const primary = projects.find(
    (p) =>
      p.project.name === primaryName ||
      repoShortName(p.repository.baseRepoFullName) === primaryName,
  );
  if (!primary) {
    throw new Error(`Primary project "${primaryName}" not found`);
  }
  const projectId = primary.project.id;

  await setProjectBudget(db, {
    workspaceId,
    projectId,
    capMicros: budgetMicros,
    actor,
  });

  await setProjectAutonomyLevel(db, {
    workspaceId,
    projectId,
    autonomyLevel: "L1",
    actor,
  });

  let brief = await getLatestBriefForProject(db, workspaceId, projectId);
  if (!brief || brief.status !== "approved") {
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea:
        "Dogfood: keep Coppergate arena healthy on the kprompt primary repo. First tasks must be product increments (not typo/scaffold) and primary-only.",
      content: {
        title: "Kprompt dogfood — first survivor PR",
        targetUser: "Kprompt operators",
        problem: "Need an in-product dogfood loop on the real multi-repo product.",
        scope: "Primary repo only for first PR; secondaries are read context.",
        nonGoals: "Cross-repo coordinated PRs; agent-to-agent chat.",
        acceptanceCriteria: [
          "Tiny issue imported and queued",
          "Survivor PR opens on kprompt/kprompt",
          "CI + cost visible in review",
        ],
        clarifyingAnswers: [],
      },
    });
    brief = await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });
  }

  const { arena, contenders } = await ensureArenaForProject(db, {
    workspaceId,
    projectId,
    actor,
    contenderBudgetMicros: 100_000,
    defaultContenderN: 2,
    contenderCount: 2,
    minHuman: true,
  });

  const strategies = [
    ...new Set(contenders.filter((c) => c.status === "ACTIVE").map((c) => c.strategy)),
  ];

  console.log(
    JSON.stringify(
      {
        workspaceId,
        projectId,
        projectName: primary.project.name,
        budgetMicros,
        briefId: brief.id,
        briefStatus: brief.status,
        arenaId: arena.id,
        arenaStatus: arena.status,
        contenderCount: contenders.length,
        activeContenders: contenders.filter((c) => c.status === "ACTIVE").length,
        strategies,
        payoffAlpha: arena.payoffAlpha,
        note: "Community duel N=2 — Survivor requires ≥2 ACTIVE seats",
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb(db);
}
