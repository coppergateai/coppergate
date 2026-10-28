#!/usr/bin/env node
/**
 * Arm peer-only contender seats (primary engineer strategy duel) on every
 * project arena in a workspace. FULL_ARENA_PROFILE_KEYS remains catalog-only.
 *
 * Usage (Fly DATABASE_URL):
 *   pnpm --filter @coppergate/db exec node --import tsx ../../scripts/dogfood-spawn-full-roster.mjs
 *
 * Env:
 *   DATABASE_URL (required)
 *   WORKSPACE_SLUG (default: kprompt)
 *   PROJECT_NAME (optional — only spawn that project)
 *   PRIMARY_PROFILE (default: engineer)
 *   SEAT_COUNT (default: 2)
 */
import {
  applySpawnProfilesToArena,
  closeDb,
  createDb,
  getArenaForProject,
  listContendersForArena,
  listProjectsForWorkspace,
  workspaces,
} from "../packages/db/src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });
const actor = "script:dogfood-spawn-full-roster";
const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
const onlyProject = process.env.PROJECT_NAME?.trim() || null;
const primary = process.env.PRIMARY_PROFILE?.trim() || "engineer";
const seatCount = Math.max(1, Number(process.env.SEAT_COUNT ?? 2) || 2);

try {
  const ws = (await db.select().from(workspaces)).find((w) => w.slug === slug);
  if (!ws) throw new Error(`workspace ${slug} not found`);

  const rows = await listProjectsForWorkspace(db, ws.id);
  const targets = rows
    .map((r) => r.project)
    .filter((p) => (onlyProject ? p.name === onlyProject : true));

  if (targets.length === 0) {
    throw new Error(
      onlyProject
        ? `project ${onlyProject} not found in ${slug}`
        : `no projects in ${slug}`,
    );
  }

  const out = [];
  for (const project of targets) {
    await applySpawnProfilesToArena(db, {
      workspaceId: ws.id,
      projectId: project.id,
      actor,
      profileKeys: [primary],
      seatCount,
    });
    const arena = await getArenaForProject(db, {
      workspaceId: ws.id,
      projectId: project.id,
    });
    const pool = arena
      ? await listContendersForArena(db, {
          workspaceId: ws.id,
          arenaId: arena.id,
        })
      : [];
    const active = pool
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({ key: c.profileKey, strategy: c.strategy }));
    out.push({
      project: project.name,
      arenaId: arena?.id ?? null,
      activeCount: active.length,
      active,
    });
  }

  console.log(
    JSON.stringify(
      {
        workspace: slug,
        primaryProfile: primary,
        seatCount,
        projects: out,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb(db);
}
