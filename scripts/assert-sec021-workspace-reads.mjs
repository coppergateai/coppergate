#!/usr/bin/env node
/**
 * SEC-021 — workspace-scoped GET routes for project / task / run reads must:
 * - require workspaceId query param (fail-closed bad_request)
 * - call requireWorkspaceMember before DB reads
 * - use workspace-bound getters (never global id-only lookups)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Relative paths under apps/web/src/app/api */
const SEC021_READ_ROUTES = [
  {
    file: "projects/[id]/route.ts",
    scopedGetter: "getProjectForWorkspace",
    forbid: ["getProjectById", "getTaskById"],
  },
  {
    file: "tasks/[id]/route.ts",
    scopedGetter: "getTaskForWorkspace",
    forbid: ["getTaskById"],
  },
  {
    file: "tasks/[id]/evidence/route.ts",
    scopedGetter: "getTaskEvidenceBundle",
    forbid: ["getTaskById", "getTaskForWorkspace"],
  },
  {
    file: "runs/[id]/route.ts",
    scopedGetter: "getAgentRunForWorkspace",
    forbid: ["getTaskById", "claimRunById"],
  },
  {
    file: "runs/[id]/events/route.ts",
    scopedGetter: "listRunEventsForWorkspace",
    forbid: ["listRunEvents", "getTaskById"],
  },
  {
    file: "runs/[id]/artifacts/route.ts",
    scopedGetter: "listArtifactsForRun",
    forbid: ["getTaskById"],
  },
];

function assertSec021ReadRoute(spec) {
  const abs = path.join(root, "apps/web/src/app/api", spec.file);
  assert.ok(fs.existsSync(abs), `missing route file: ${spec.file}`);
  const src = fs.readFileSync(abs, "utf8");

  assert.match(
    src,
    /export\s+async\s+function\s+GET\s*\(/,
    `${spec.file}: must export GET`,
  );

  const getStart = src.indexOf("export async function GET");
  assert.ok(getStart >= 0, `${spec.file}: GET handler not found`);
  const getBody = src.slice(getStart, getStart + 2500);

  assert.match(
    getBody,
    /searchParams\.get\s*\(\s*["']workspaceId["']\s*\)/,
    `${spec.file}: GET must read workspaceId from query`,
  );
  assert.match(
    getBody,
    /bad_request[\s\S]*workspaceId/i,
    `${spec.file}: GET must reject missing workspaceId`,
  );
  assert.match(
    getBody,
    /requireWorkspaceMember\s*\(/,
    `${spec.file}: GET must call requireWorkspaceMember`,
  );
  assert.match(
    getBody,
    new RegExp(spec.scopedGetter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `${spec.file}: GET must use ${spec.scopedGetter}`,
  );

  for (const banned of spec.forbid) {
    assert.doesNotMatch(
      getBody,
      new RegExp(`\\b${banned}\\s*\\(`),
      `${spec.file}: GET must not call ${banned}`,
    );
  }
}

for (const spec of SEC021_READ_ROUTES) {
  assertSec021ReadRoute(spec);
}

console.log(
  `SEC-021 OK: ${SEC021_READ_ROUTES.length} workspace-scoped read routes enforce tenant isolation`,
);
