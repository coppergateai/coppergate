#!/usr/bin/env node
/**
 * Sole-dev boot: refresh install token, verify architecture Open IDs, Start arena.
 */
import {
  closeDb,
  createDb,
  fetchArchitectureBacklogMarkdown,
  getInstallationForWorkspace,
  listProjectsForWorkspace,
  parseArchitectureOpenTasks,
  pickNextArchitectureTask,
  startProjectArena,
  updateInstallationToken,
  workspaces,
} from "../packages/db/src/index.ts";
import {
  createAppJwt,
  createInstallationAccessToken,
  parseEncryptionKey,
  sealSecret,
} from "../packages/github/src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const db = createDb(url, { max: 1 });
const actor = "script:dogfood-sole-dev-boot";

try {
  process.env.ARCHITECTURE_REPO =
    process.env.ARCHITECTURE_REPO || "kprompt/kprompt-architecture";
  process.env.ARCHITECTURE_PATHS =
    process.env.ARCHITECTURE_PATHS ||
    "PROVIDER-TASKS.md,RUNTIME-TASKS.md,AGENT-TASKS.md,APP-TASKS.md,WEBSITE-TASKS.md,CONTENT-PLAN.md";

  const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
  const ws = (await db.select().from(workspaces)).find((w) => w.slug === slug);
  if (!ws) throw new Error(`workspace ${slug} not found`);
  const inst = await getInstallationForWorkspace(db, ws.id);
  if (!inst) throw new Error("no github installation");

  const jwt = await createAppJwt({
    appId: process.env.GITHUB_APP_ID,
    slug: process.env.GITHUB_APP_SLUG,
    privateKeyPem: process.env.GITHUB_APP_PRIVATE_KEY,
  });
  const minted = await createInstallationAccessToken(
    jwt,
    Number(inst.githubInstallationId),
  );
  const key = parseEncryptionKey(process.env.CREDENTIALS_ENCRYPTION_KEY);
  await updateInstallationToken(
    db,
    inst.id,
    sealSecret(minted.token, key),
    minted.expiresAt,
  );

  const md = await fetchArchitectureBacklogMarkdown(minted.token);
  const tasks = parseArchitectureOpenTasks(md);
  const next = pickNextArchitectureTask(tasks);

  const projects = await listProjectsForWorkspace(db, ws.id);
  const primary = projects.find((p) => p.project.name === "kprompt");
  if (!primary) throw new Error("primary kprompt missing");

  const started = await startProjectArena(db, {
    workspaceId: ws.id,
    projectId: primary.project.id,
    actor,
  });

  console.log(
    JSON.stringify(
      {
        ok: Boolean(next) && md.length > 0,
        architecture: {
          bytes: md.length,
          openCount: tasks.length,
          next: next
            ? { id: next.id, title: next.title.slice(0, 100) }
            : null,
        },
        arena: {
          projectId: primary.project.id,
          status: started?.status ?? started?.arena?.status ?? null,
        },
        installId: Number(inst.githubInstallationId),
      },
      null,
      2,
    ),
  );
  process.exitCode = next && md.length > 0 ? 0 : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
