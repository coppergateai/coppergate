#!/usr/bin/env node
/**
 * One-shot maintainer scheduler tick for dogfood verification.
 */
import {
  closeDb,
  createDb,
  getMaintainerMetrics,
  listMaintainerProjects,
  tickMaintainerProject,
} from "../packages/db/src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  const projects = await listMaintainerProjects(db);
  if (!projects.length) {
    console.log(JSON.stringify({ ok: false, reason: "no maintainer projects" }));
    process.exit(0);
  }
  const results = [];
  for (const p of projects) {
    const tick = await tickMaintainerProject(db, {
      workspaceId: p.workspaceId,
      projectId: p.id,
      actor: "script:dogfood-maintainer-tick",
    });
    const metrics = await getMaintainerMetrics(db, {
      workspaceId: p.workspaceId,
      projectId: p.id,
    });
    results.push({
      name: p.name,
      projectId: p.id,
      tick,
      metrics,
    });
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
