#!/usr/bin/env node
/**
 * AG-022 — detectDocsDrift wired to optional Arena attention (not Spend License bypass).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const executeTs = path.join(root, "apps/worker/src/execute.ts");
const spendTs = path.join(root, "packages/db/src/spend-license.ts");
const arenaTs = path.join(root, "packages/db/src/workspace-arena.ts");

const executeSrc = fs.readFileSync(executeTs, "utf8");
assert.match(
  executeSrc,
  /evaluateDocsDriftAttention/,
  "worker delivery must evaluate docs drift",
);
assert.match(
  executeSrc,
  /docsDriftProgressPayload/,
  "worker must emit docs_drift progress payload",
);

const spendSrc = fs.readFileSync(spendTs, "utf8");
assert.doesNotMatch(
  spendSrc,
  /docs_drift|docsDrift|detectDocsDrift/,
  "Spend License must not bypass on docs drift",
);

const arenaSrc = fs.readFileSync(arenaTs, "utf8");
assert.match(
  arenaSrc,
  /optionalAttention/,
  "Arena snapshot must expose optionalAttention",
);
assert.match(
  arenaSrc,
  /docsDriftAttentionForRuns/,
  "Arena must load docs drift from delivery artifacts",
);

console.log("AG-022 OK: docs drift → optional Arena attention wired");
