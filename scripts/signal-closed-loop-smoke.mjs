#!/usr/bin/env node
/**
 * Reminder + thin wrapper for the Sonar/CI-fail closed-loop proof.
 *
 * Preferred CI check (needs DATABASE_URL + migrated Postgres):
 *   pnpm --filter @coppergate/worker exec node --import tsx --test src/e2e-signal-closed-loop.test.ts
 *
 * Staging liveness remains:
 *   STAGING_URL=… node scripts/staging-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required for signal closed-loop smoke (e2e-signal-closed-loop.test.ts)",
  );
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@coppergate/worker",
    "exec",
    "node",
    "--import",
    "tsx",
    "--test",
    "--test-force-exit",
    "src/e2e-signal-closed-loop.test.ts",
  ],
  { cwd: root, stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
