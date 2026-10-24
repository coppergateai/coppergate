#!/usr/bin/env node
/**
 * One-shot: release estimate_reserve no longer covered by active runs.
 *
 * Dry-run (default):
 *   pnpm ops:reconcile-reserves
 *   WORKSPACE_SLUG=kprompt pnpm ops:reconcile-reserves
 *
 * Apply:
 *   pnpm ops:reconcile-reserves -- --apply
 *   WORKSPACE_SLUG=kprompt pnpm ops:reconcile-reserves -- --apply
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeDb,
  createDb,
  getWorkspaceSpendSummary,
  reconcileStaleEstimateReserves,
  workspaces,
} from "../packages/db/src/index.ts";
import { opsArgv } from "./ops-argv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(resolve(root, ".env"));
loadDotEnv(resolve(root, ".env.local"));

const args = opsArgv();
const apply = args.includes("--apply");
const slug =
  process.env.WORKSPACE_SLUG?.trim() ||
  argValue(args, "--workspace") ||
  null;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  let workspaceId = process.env.WORKSPACE_ID?.trim() || null;
  if (!workspaceId && slug) {
    const rows = await db.select().from(workspaces);
    const ws = rows.find((w) => w.slug === slug);
    if (!ws) {
      console.error(`workspace slug=${slug} not found`);
      process.exit(1);
    }
    workspaceId = ws.id;
    console.log(`workspace ${slug} → ${workspaceId}`);
  }

  const before = workspaceId
    ? await getWorkspaceSpendSummary(db, workspaceId)
    : null;
  if (before) {
    console.log(
      `before: spent=${usd(before.spentMicros)} reserved=${usd(before.reservedMicros)} available=${usd(before.availableMicros)} / cap=${usd(before.capMicros)}`,
    );
  }

  const result = await reconcileStaleEstimateReserves(db, {
    workspaceId,
    dryRun: !apply,
  });

  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: apply ? "apply" : "dry-run",
        workspaceId: result.workspaceId,
        tasks: result.rows.length,
        releaseMicros: result.releasedMicros,
        releaseUsd: Number((result.releasedMicros / 1_000_000).toFixed(4)),
        releasedEvents: result.releasedEvents,
        sample: result.rows.slice(0, 15).map((r) => ({
          taskId: r.taskId.slice(0, 8),
          projectId: r.projectId.slice(0, 8),
          outstandingUsd: Number((r.outstandingMicros / 1_000_000).toFixed(4)),
          keepUsd: Number((r.activeHoldMicros / 1_000_000).toFixed(4)),
          releaseUsd: Number((r.releaseMicros / 1_000_000).toFixed(4)),
        })),
      },
      null,
      2,
    ),
  );

  if (apply && workspaceId) {
    const after = await getWorkspaceSpendSummary(db, workspaceId);
    if (after) {
      console.log(
        `after: spent=${usd(after.spentMicros)} reserved=${usd(after.reservedMicros)} available=${usd(after.availableMicros)} / cap=${usd(after.capMicros)}`,
      );
    }
  }

  if (!apply && result.rows.length > 0) {
    console.log("\nRe-run with --apply to write estimate_release events.");
  }
} finally {
  await closeDb(db);
}

function usd(micros) {
  return `$${(Number(micros) / 1_000_000).toFixed(4)}`;
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  return argv[i + 1]?.trim() || null;
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
