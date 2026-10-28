#!/usr/bin/env node
/**
 * Kprompt dogfood proof: second (or Nth) autonomous merge without human Accept.
 *
 * Checks maintainer metrics + recent auto_accept / auto_merge events on the
 * primary project. Exit 0 when proof is satisfied; exit 2 when not yet.
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-prove-autonomous-merge.mjs
 *
 * Env / flags:
 *   --workspace-id UUID | WORKSPACE_ID | WORKSPACE_SLUG (default kprompt)
 *   --primary-name kprompt
 *   --min-auto-accepts 2   (default 2 = first human Accept + ≥1 unattended)
 *   --min-auto-merges 1
 *   --days 30
 */
import {
  closeDb,
  createDb,
  getMaintainerMetrics,
  listProjectsForWorkspace,
  maintainerEvents,
  workspaces,
} from "../packages/db/src/index.ts";
import { and, desc, eq, gte } from "../packages/db/node_modules/drizzle-orm/index.js";

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
const minAutoAccepts = Number(
  argValue("--min-auto-accepts") ?? process.env.MIN_AUTO_ACCEPTS ?? "2",
);
const minAutoMerges = Number(
  argValue("--min-auto-merges") ?? process.env.MIN_AUTO_MERGES ?? "1",
);
const days = Number(argValue("--days") ?? process.env.DAYS ?? "30");
const actor = process.env.DOGFOOD_ACTOR ?? "script:dogfood-prove-autonomous-merge";

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
  if (!row) throw new Error(`Workspace not found (slug=${slug})`);
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
  const metrics = await getMaintainerMetrics(db, {
    workspaceId,
    projectId,
    days,
  });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, projectId),
        gte(maintainerEvents.createdAt, since),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(100);

  const autoAcceptEvents = events.filter((e) => e.kind === "auto_accept");
  const autoMergeEvents = events.filter((e) => e.kind === "auto_merge");
  const metaEvents = events.filter((e) => e.kind === "meta_tournament");
  const replanEvents = events.filter((e) => e.kind === "replan");

  const ok =
    metrics.maintainerEnabled &&
    metrics.autoAccepts >= minAutoAccepts &&
    autoMergeEvents.filter((e) => {
      try {
        return Boolean(JSON.parse(e.payload)?.merged);
      } catch {
        return false;
      }
    }).length >= minAutoMerges;

  const report = {
    ok,
    actor,
    projectId,
    name: primary.project.name,
    repo: primary.repository.baseRepoFullName,
    metrics: {
      merges: metrics.merges,
      verifiedMerges: metrics.verifiedMerges,
      autoAccepts: metrics.autoAccepts,
      humanTouches: metrics.humanTouches,
      spendMicros: metrics.spendMicros,
      costPerAcceptedMergeMicros: metrics.costPerAcceptedMergeMicros,
      metaTournaments: metrics.metaTournaments,
      replans: metrics.replans,
      winningProfileKeys: metrics.winningProfileKeys,
      maintainerEnabled: metrics.maintainerEnabled,
    },
    events: {
      autoAccepts: autoAcceptEvents.length,
      autoMerges: autoMergeEvents.length,
      metaTournaments: metaEvents.length,
      replans: replanEvents.length,
    },
    thresholds: { minAutoAccepts, minAutoMerges, days },
    note: ok
      ? "Autonomous merge proof satisfied (winner-gated auto-accept path)."
      : "Not yet proven — keep worker ticking with GITHUB_DELIVERY_MODE=http until auto_accept + auto_merge land without human Accept.",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = ok ? 0 : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
