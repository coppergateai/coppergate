#!/usr/bin/env node
/**
 * AG-024 — dual-workspace spend isolation: reserve/ledger paths assert workspace scope.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgetsTs = path.join(root, "packages/db/src/budgets.ts");

const src = fs.readFileSync(budgetsTs, "utf8");

assert.match(
  src,
  /assertUsageEventWorkspaceScope/,
  "budgets.ts must define workspace scope guard",
);
assert.match(
  src,
  /dual-workspace envelopes never share debit/,
  "guard must document AG-024 isolation invariant",
);

const reserveBlock = src.slice(
  src.indexOf("export async function reserveEstimateForTask"),
  src.indexOf("export async function releaseEstimateForTask"),
);
assert.match(
  reserveBlock,
  /assertUsageEventWorkspaceScope\s*\(/,
  "reserveEstimateForTask must assert workspaceId scope before debit",
);

const appendBlock = src.slice(
  src.indexOf("export async function appendUsageEvent"),
  src.indexOf("export async function reserveEstimateForTask"),
);
assert.match(
  appendBlock,
  /assertUsageEventWorkspaceScope\s*\(/,
  "appendUsageEvent must assert workspace scope on every ledger write",
);

console.log("AG-024 OK: dual-workspace spend isolation guards present");
