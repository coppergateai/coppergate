#!/usr/bin/env node
/**
 * Coppergate self-pilot prove: after GitHub App + primary project exist,
 * boot arena (optional --start), verify Open IDs, enable maintainer,
 * and print the first Open ID to Accept once in Evidence.
 *
 * Usage (on Fly worker or with prod DATABASE_URL):
 *   WORKSPACE_SLUG=coppergate PRIMARY_NAME=coppergate \
 *   ARCHITECTURE_REPO=coppergateai/coppergate-architecture \
 *   ARCHITECTURE_PATHS=docs/OPEN_PROGRAM.md \
 *   MAINTAINER_BUDGET_MICROS=8000000 \
 *   pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-coppergate-prove.mjs [--start] [--enable-maintainer]
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const boot = join(here, "dogfood-coppergate-boot.mjs");
const enable = join(here, "dogfood-enable-maintainer.mjs");

const wantStart = process.argv.includes("--start");
const wantEnable = process.argv.includes("--enable-maintainer");

process.env.WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "coppergate";
process.env.PRIMARY_NAME = process.env.PRIMARY_NAME ?? "coppergate";
process.env.ARCHITECTURE_REPO =
  process.env.ARCHITECTURE_REPO ?? "coppergateai/coppergate-architecture";
process.env.ARCHITECTURE_PATHS =
  process.env.ARCHITECTURE_PATHS ?? "docs/OPEN_PROGRAM.md";
process.env.MAINTAINER_BUDGET_MICROS =
  process.env.MAINTAINER_BUDGET_MICROS ?? "8000000";

const bootArgs = [boot];
if (wantStart) bootArgs.push("--start");

const bootRun = spawnSync(
  process.execPath,
  ["--import", "tsx", ...bootArgs],
  { stdio: "inherit", env: process.env },
);
if (bootRun.status !== 0 && bootRun.status !== 2) {
  process.exit(bootRun.status ?? 1);
}

if (wantEnable) {
  const en = spawnSync(
    process.execPath,
    ["--import", "tsx", enable],
    { stdio: "inherit", env: process.env },
  );
  if (en.status !== 0) process.exit(en.status ?? 1);
}

console.log(
  JSON.stringify(
    {
      nextHumanSteps: [
        "Keep kprompt Arena paused",
        "Open coppergate Arena → Start (if not --start)",
        "Accept the first survivor PR for AG-010 (or next Open ID) in Evidence once",
        "Confirm architecture writeback flips the row to Done",
        "Second Open ID should auto-queue under continuous backlog",
      ],
      workspaceSlug: process.env.WORKSPACE_SLUG,
      architecture: process.env.ARCHITECTURE_PATHS,
      budgetMicros: process.env.MAINTAINER_BUDGET_MICROS,
    },
    null,
    2,
  ),
);
