#!/usr/bin/env node
/**
 * AG-040 — design scout: Playwright routes, layout overflow → Open Program P-N rows.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const designScoutTs = path.join(root, "packages/db/src/design-scout.ts");
const designScoutTest = path.join(root, "packages/db/src/design-scout.test.ts");
const maintainerTick = path.join(root, "apps/worker/src/maintainer-tick.ts");
const designScoutTick = path.join(root, "apps/worker/src/design-scout-tick.ts");
const designScoutCapture = path.join(
  root,
  "apps/worker/src/design-scout-capture.ts",
);
const maintainerTs = path.join(root, "packages/db/src/maintainer.ts");
const maintainerPanel = path.join(
  root,
  "apps/web/src/app/workspaces/[id]/projects/[projectId]/maintainer-panel.tsx",
);
const docs = path.join(root, "docs/design-scout-open-program.md");

for (const f of [
  designScoutTs,
  designScoutTest,
  maintainerTick,
  designScoutTick,
  designScoutCapture,
  maintainerTs,
  maintainerPanel,
  docs,
]) {
  assert.ok(fs.existsSync(f), `missing ${f}`);
}

const designSrc = fs.readFileSync(designScoutTs, "utf8");
assert.match(designSrc, /DESIGN_SCOUT_SECTION_HEADING/);
assert.match(designSrc, /design-scout:fp=/);
assert.match(designSrc, /designScoutFingerprint/);
assert.match(designSrc, /proposeDesignOpenRows/);
assert.match(designSrc, /shotHasDesignFinding/);
assert.match(designSrc, /nextArchitectureId\(mdForIds, "P"\)/);

const policySrc = fs.readFileSync(maintainerTs, "utf8");
assert.match(policySrc, /designScout:\s*false/);
assert.match(policySrc, /designScoutIntervalHours/);
assert.match(policySrc, /designScoutMaxPerRun/);

const tickSrc = fs.readFileSync(maintainerTick, "utf8");
assert.match(tickSrc, /runDesignScoutForProject/);

const scoutTick = fs.readFileSync(designScoutTick, "utf8");
assert.match(scoutTick, /captureDesignScoutShots/);
assert.match(scoutTick, /proposeDesignOpenRows/);
assert.match(scoutTick, /appendArchitectureOpenRows/);
assert.match(scoutTick, /appendDesignScoutOpenRowsToMarkdown/);
assert.match(scoutTick, /recordDesignScoutEvent/);
assert.match(scoutTick, /commitKind:\s*"design-scout"/);

const captureSrc = fs.readFileSync(designScoutCapture, "utf8");
assert.match(captureSrc, /playwright|chromium/i);

const panelSrc = fs.readFileSync(maintainerPanel, "utf8");
assert.match(panelSrc, /designScout/);
assert.match(panelSrc, /AG-040/);

console.log(
  "AG-040 OK: design scout wired with policy, Playwright capture, fp dedup, Open P-N rows",
);
