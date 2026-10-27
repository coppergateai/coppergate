#!/usr/bin/env node
/**
 * SEC-022 — agent path allowlist hygiene:
 * - Coding agents gate FILE writes via evaluateAgentWritePath (forbidden paths + secrets)
 * - Worker delivery refuses forbidden paths and token material before http ship
 * - Sandbox path containment stays on resolveContainedPath for reads
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

const pathPolicy = read("packages/agents/src/path-policy.ts");
assert.match(
  pathPolicy,
  /export function isForbiddenAgentPath\s*\(/,
  "path-policy must export isForbiddenAgentPath",
);
assert.match(
  pathPolicy,
  /export function evaluateAgentWritePath\s*\(/,
  "path-policy must export evaluateAgentWritePath",
);
assert.match(
  pathPolicy,
  /export function containsForbiddenWriteSecret\s*\(/,
  "path-policy must export containsForbiddenWriteSecret",
);

for (const rel of [
  "packages/agents/src/openai-compatible.ts",
  "packages/agents/src/cursor-sdk.ts",
]) {
  const src = read(rel);
  assert.match(
    src,
    /evaluateAgentWritePath\s*\(/,
    `${rel}: must gate writes with evaluateAgentWritePath`,
  );
}

const workdirDiff = read("packages/agents/src/workdir-diff.ts");
assert.match(
  workdirDiff,
  /isForbiddenAgentPath\s*\(/,
  "workdir-diff must skip forbidden paths in snapshots",
);

const delivery = read("apps/worker/src/delivery-files.ts");
assert.match(
  delivery,
  /isForbiddenAgentPath\s*\(/,
  "delivery-files must refuse forbidden paths",
);
assert.match(
  delivery,
  /assertDeliverySecretsRefused\s*\(/,
  "delivery-files must export assertDeliverySecretsRefused",
);

const execute = read("apps/worker/src/execute.ts");
assert.match(
  execute,
  /assertDeliverySecretsRefused\s*\(/,
  "execute must call assertDeliverySecretsRefused before http delivery",
);

const sandboxPaths = read("packages/sandbox/src/paths.ts");
assert.match(
  sandboxPaths,
  /Path escapes sandbox workdir/,
  "sandbox paths must reject workdir escape",
);

console.log("SEC-022 OK: agent path allowlist hygiene wired (forbidden paths, secrets, containment)");
