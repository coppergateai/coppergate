#!/usr/bin/env node
/**
 * AG-030 — maintainer enable must not silently raise spend/tools/repos/prod-adjacent policy.
 * Fail-closed regression: enable path uses maintainer-enable-guard and does not attach repos.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const maintainerTs = path.join(
  root,
  "packages/db/src/maintainer.ts",
);
const guardTs = path.join(
  root,
  "packages/db/src/maintainer-enable-guard.ts",
);

assert.ok(fs.existsSync(guardTs), "missing maintainer-enable-guard.ts");
const maintainerSrc = fs.readFileSync(maintainerTs, "utf8");

assert.match(
  maintainerSrc,
  /from\s+["']\.\/maintainer-enable-guard\.js["']/,
  "maintainer.ts must import maintainer-enable-guard",
);
assert.match(
  maintainerSrc,
  /sanitizePolicyForMaintainerEnable\s*\(/,
  "enableMaintainerMode must sanitize policy via guard",
);
assert.match(
  maintainerSrc,
  /shouldInitWorkspaceBudgetOnEnable/,
  "enable must only init workspace budget when none exists",
);

const enableBlock = maintainerSrc.slice(
  maintainerSrc.indexOf("export async function enableMaintainerMode"),
  maintainerSrc.indexOf("export type ArenaControlResult"),
);
assert.doesNotMatch(
  enableBlock,
  /setProjectMultiRepoPolicy/,
  "enableMaintainerMode must not enable multi-repo (use explicit policy API)",
);

console.log("AG-030 OK: maintainer enable guarded against silent escalation");
