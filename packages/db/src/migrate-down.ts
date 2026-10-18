import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Rolls back migrations newest-first
 * (run_events → agent_runs → budgets → … → baseline).
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const downs = [
  "0027_maintainer.down.sql",
  "0026_pr_review.down.sql",
  "0025_multi_llm.down.sql",
  "0024_multi_repo.down.sql",
  "0023_billing.down.sql",
  "0022_agent_profiles.down.sql",
  "0021_signals.down.sql",
  "0020_scm.down.sql",
  "0019_expansion.down.sql",
  "0018_game_theory.down.sql",
  "0017_arena.down.sql",
  "0016_pilot_invites.down.sql",
  "0015_deletion.down.sql",
  "0014_artifacts.down.sql",
  "0013_run_events.down.sql",
  "0012_agent_runs.down.sql",
  "0011_budgets.down.sql",
  "0010_approvals.down.sql",
  "0009_task_transitions.down.sql",
  "0008_plan.down.sql",
  "0007_briefs.down.sql",
  "0006_projects.down.sql",
  "0005_webhooks.down.sql",
  "0004_waitlist.down.sql",
  "0003_github.down.sql",
  "0002_workspaces.down.sql",
  "0001_users.down.sql",
  "0000_baseline.down.sql",
];

const client = postgres(url, { max: 1 });
try {
  for (const file of downs) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    await client.unsafe(sql);
    console.log(`Applied ${file}`);
  }
  await client`drop table if exists drizzle.__drizzle_migrations cascade`;
  await client`drop table if exists "__drizzle_migrations" cascade`;
  await client`drop schema if exists drizzle cascade`;
  console.log("All migrations rolled back.");
} finally {
  await client.end({ timeout: 5 });
}
