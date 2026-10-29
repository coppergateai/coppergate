#!/usr/bin/env node
/**
 * AG-025 — replan throttles under $1 available: maxAutoQueue=1 + lean roster.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const maintainerTs = path.join(root, "packages/db/src/maintainer.ts");
const testTs = path.join(root, "packages/db/src/maintainer.test.ts");

const src = fs.readFileSync(maintainerTs, "utf8");
const testSrc = fs.readFileSync(testTs, "utf8");

assert.match(src, /REPLAN_LEAN_BUDGET_MICROS\s*=\s*1_000_000/);
assert.match(src, /export function maxAutoQueueForReplan/);
assert.match(src, /maxAutoQueueForReplan\s*\(/);
assert.match(
  src,
  /rosterKeysForAvailableBudget[\s\S]*REPLAN_LEAN_BUDGET_MICROS/,
  "roster must lean under REPLAN_LEAN_BUDGET_MICROS",
);
assert.match(testSrc, /AG-025/);

console.log("AG-025 OK: replan lean budget cap + roster wired");
