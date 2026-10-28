#!/usr/bin/env node
/**
 * SEC-036 — prod / default-branch write policy gate:
 * - SCM prod-write-policy helpers
 * - GitHub merge / release / contents API refuse without explicit flags
 * - Sandbox blocks production deploy commands unless prod_writes_enabled
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const policy = read("packages/scm/src/prod-write-policy.ts");
assert.match(policy, /assertDefaultBranchMergeAllowed/);
assert.match(policy, /assertProductionDeployAllowed/);
assert.match(policy, /assertReleaseAllowed/);

const merge = read("packages/github/src/issues.ts");
assert.match(merge, /allowDefaultBranchWrite/);
assert.match(merge, /assertDefaultBranchMergeAllowed/);

const release = read("packages/github/src/release.ts");
assert.match(release, /allowRelease/);
assert.match(release, /assertReleaseAllowed/);

const contents = read("packages/github/src/contents.ts");
assert.match(contents, /assertDefaultBranchContentsWriteAllowed/);

const cmd = read("packages/sandbox/src/command-policy.ts");
assert.match(cmd, /assertProductionDeployAllowed/);
assert.match(cmd, /looksLikeProductionDeploy/);

for (const rel of [
  "apps/worker/src/maintainer-tick.ts",
  "apps/web/src/app/api/tasks/[id]/review/route.ts",
]) {
  const src = read(rel);
  assert.match(src, /allowDefaultBranchWrite/);
}

console.log("SEC-036 OK: prod / default-branch write policy gate wired");
