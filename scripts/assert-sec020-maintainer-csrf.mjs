#!/usr/bin/env node
/**
 * SEC-020 — mutating maintainer / budget / arena API routes must call requireCsrf
 * before auth or DB work so cookie sessions reject cross-site posts without Origin.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Relative paths under apps/web/src/app/api */
const SEC020_ROUTE_FILES = [
  "projects/[id]/maintainer/route.ts",
  "projects/[id]/budget/route.ts",
  "workspaces/[id]/budget/route.ts",
  "workspaces/[id]/arena/route.ts",
  "projects/[id]/arena/route.ts",
  "projects/[id]/arena/start/route.ts",
  "projects/[id]/arena/stop/route.ts",
  "projects/[id]/arena/kill/route.ts",
  "projects/[id]/arena/resume/route.ts",
];

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function assertSec020Route(relativePath) {
  const abs = path.join(root, "apps/web/src/app/api", relativePath);
  assert.ok(fs.existsSync(abs), `missing route file: ${relativePath}`);
  const src = fs.readFileSync(abs, "utf8");

  assert.match(
    src,
    /requireCsrf\s*\(\s*request\s*\)/,
    `${relativePath}: must call requireCsrf(request)`,
  );
  assert.match(
    src,
    /from\s+["']@\/lib\/csrf["']/,
    `${relativePath}: must import requireCsrf from @/lib/csrf`,
  );

  const handlerRe =
    /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = handlerRe.exec(src)) !== null) {
    const method = match[1];
    if (!MUTATING.has(method)) continue;
    const start = match.index;
    const slice = src.slice(start, start + 1200);
    assert.match(
      slice,
      /requireCsrf\s*\(\s*request\s*\)/,
      `${relativePath}: ${method} handler must call requireCsrf(request) near the top`,
    );
  }
}

for (const rel of SEC020_ROUTE_FILES) {
  assertSec020Route(rel);
}

console.log(
  `SEC-020 OK: ${SEC020_ROUTE_FILES.length} maintainer/budget/arena routes enforce requireCsrf`,
);
