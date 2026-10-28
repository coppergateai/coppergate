#!/usr/bin/env node
/**
 * Dogfood proof: multi-project maintainer rollup (P-145).
 *
 * Exit 0 when workspace rollup shows verified merges and optional zero-touch delivery.
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-prove-workspace-maintainer-rollup.mjs
 *
 * Env / flags:
 *   --workspace-id UUID | WORKSPACE_ID | WORKSPACE_SLUG (default kprompt)
 *   --min-verified-merges 1
 *   --require-zero-touch  (humanTouches must be 0)
 *   --days 30
 */
import {
  closeDb,
  createDb,
  getWorkspaceMaintainerRollup,
  workspaces,
} from "../packages/db/src/index.ts";

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const minVerified = Number(
  argValue("--min-verified-merges") ??
    process.env.MIN_VERIFIED_MERGES ??
    "1",
);
const requireZeroTouch =
  process.argv.includes("--require-zero-touch") ||
  process.env.REQUIRE_ZERO_TOUCH === "1";
const days = Number(argValue("--days") ?? process.env.DAYS ?? "30");
const actor =
  process.env.DOGFOOD_ACTOR ?? "script:dogfood-prove-workspace-maintainer-rollup";

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

try {
  const workspaceId = await resolveWorkspaceId();
  const rollup = await getWorkspaceMaintainerRollup(db, { workspaceId, days });

  const ok =
    rollup.totals.maintainerProjectCount > 0 &&
    rollup.totals.verifiedMerges >= minVerified &&
    (!requireZeroTouch || rollup.totals.zeroTouchDelivery);

  const report = {
    ok,
    actor,
    workspaceId,
    windowDays: rollup.windowDays,
    workspace: rollup.workspace,
    totals: rollup.totals,
    projects: rollup.projects.map((p) => ({
      projectId: p.projectId,
      name: p.projectName,
      verifiedMerges: p.verifiedMerges,
      humanTouches: p.humanTouches,
      spendMicros: p.spendMicros,
    })),
    thresholds: { minVerified, requireZeroTouch, days },
    note: ok
      ? "Workspace maintainer rollup proof satisfied (P-145)."
      : "Not yet — enable maintainer on projects and keep worker merging until verifiedMerges land.",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = ok ? 0 : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
