#!/usr/bin/env node
/**
 * AG-037 — continuous bug scout: maintainer tick, policy, dedup, skip ship-gate noise.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const bugScoutTs = path.join(root, "packages/db/src/bug-scout.ts");
const maintainerTick = path.join(root, "apps/worker/src/maintainer-tick.ts");
const bugScoutTick = path.join(root, "apps/worker/src/bug-scout-tick.ts");
const maintainerTs = path.join(root, "packages/db/src/maintainer.ts");

for (const f of [bugScoutTs, maintainerTick, bugScoutTick, maintainerTs]) {
  assert.ok(fs.existsSync(f), `missing ${f}`);
}

const bugScoutSrc = fs.readFileSync(bugScoutTs, "utf8");
assert.match(bugScoutSrc, /BUG_SCOUT_SECTION_HEADING/);
assert.match(bugScoutSrc, /bug-scout:fp=/);
assert.match(bugScoutSrc, /waiting_ci_timeout/);
assert.match(bugScoutSrc, /merge_conflict/);
assert.match(bugScoutSrc, /stale_delivery/);
assert.match(bugScoutSrc, /NOISE_TITLE_RE/);
assert.match(bugScoutSrc, /ship-gate/);

const policySrc = fs.readFileSync(maintainerTs, "utf8");
assert.match(policySrc, /bugScout:\s*false/);
assert.match(policySrc, /bugScoutIntervalHours/);

const tickSrc = fs.readFileSync(maintainerTick, "utf8");
assert.match(tickSrc, /runBugScoutForProject/);

const scoutTick = fs.readFileSync(bugScoutTick, "utf8");
assert.match(scoutTick, /fetchCheckRunAnnotationSnippet|fetchCommitCheckEvidence/);
assert.match(scoutTick, /appendArchitectureOpenRows/);
assert.match(scoutTick, /recordBugScoutEvent/);

console.log("AG-037 OK: bug scout wired with policy, dedup, CI evidence");
