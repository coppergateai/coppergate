#!/usr/bin/env node
/**
 * Kprompt dogfood: flip primary project into fully autonomous maintainer mode.
 *
 * Default envelope: $100/mo workspace pool (DEFAULT_MONTHLY_BUDGET_MICROS). L2 + auto-merge + self-improve.
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-enable-maintainer.mjs [--workspace-id UUID] [--primary-name kprompt]
 */
import {
  DEFAULT_MONTHLY_BUDGET_MICROS,
  closeDb,
  createDb,
  enableMaintainerMode,
  listProjectsForWorkspace,
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
const budgetMicros = Number(
  process.env.MAINTAINER_BUDGET_MICROS ?? String(DEFAULT_MONTHLY_BUDGET_MICROS),
);
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-enable-maintainer";

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

  const { project, policy } = await enableMaintainerMode(db, {
    workspaceId,
    projectId: primary.project.id,
    actor,
    policy: {
      monthlyBudgetMicros: budgetMicros,
      autoMerge: true,
      autoRelease: true,
      selfImprove: true,
      communityReplies: true,
      communityScout: true,
      autoQueueReplanTasks: true,
      maxAutoQueuePerReplan: 2,
      // GoReleaser-friendly tags (v0.YYYYMMDD.N) for kprompt primary
      releaseTagStyle: "semver_patch",
      maxTournamentN: 2,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: project.id,
        name: project.name,
        maintainerEnabled: project.maintainerEnabled,
        autonomyLevel: project.autonomyLevel,
        mergeEnabled: project.mergeEnabled,
        policy,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
