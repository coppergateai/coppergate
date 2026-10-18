#!/usr/bin/env node
/**
 * Kprompt dogfood: consolidate sibling 1:1 projects into one primary + secondaries.
 *
 * Usage (from coppergate root):
 *   DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-consolidate-repos.mjs \
 *     [--dry-run] [--workspace-id UUID] [--primary-name kprompt]
 *
 * Env defaults:
 *   WORKSPACE_ID or WORKSPACE_SLUG=kprompt
 *   PRIMARY_NAME=kprompt
 *   SECONDARY_REPOS=kprompt-app,kprompt-api,kprompt-website,kprompt-dash,kprompt-admin
 */
import {
  archiveProject,
  attachSecondaryRepo,
  closeDb,
  createDb,
  listProjectsForWorkspace,
  listReposForProject,
  listRepositoryConnections,
  setProjectMultiRepoPolicy,
  workspaces,
} from "../packages/db/src/index.ts";

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const dryRun = argFlag("--dry-run");
const primaryName = (
  argValue("--primary-name") ??
  process.env.PRIMARY_NAME ??
  "kprompt"
).trim();
const secondaryNames = (
  argValue("--secondary-repos") ??
  process.env.SECONDARY_REPOS ??
  "kprompt-app,kprompt-api,kprompt-website,kprompt-dash,kprompt-admin"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

async function resolveWorkspaceId() {
  const fromArg = argValue("--workspace-id") ?? process.env.WORKSPACE_ID;
  if (fromArg) return fromArg;
  const slug = process.env.WORKSPACE_SLUG ?? "kprompt";
  const rows = await db.select().from(workspaces);
  const row = rows.find((w) => w.slug === slug);
  if (!row) {
    throw new Error(
      `Workspace not found (slug=${slug}). Pass --workspace-id or WORKSPACE_ID.`,
    );
  }
  return row.id;
}

function repoShortName(fullName) {
  const parts = fullName.split("/");
  return parts[parts.length - 1] ?? fullName;
}

try {
  const workspaceId = await resolveWorkspaceId();
  const projects = await listProjectsForWorkspace(db, workspaceId);
  const connections = await listRepositoryConnections(db, workspaceId);

  console.log(
    JSON.stringify(
      {
        dryRun,
        workspaceId,
        primaryName,
        secondaryNames,
        before: {
          projects: projects.map((p) => ({
            id: p.project.id,
            name: p.project.name,
            status: p.project.status,
            repo: p.repository.baseRepoFullName,
            role: p.repository.repoRole,
          })),
          unbound: connections
            .filter((c) => !c.projectId)
            .map((c) => c.baseRepoFullName),
        },
      },
      null,
      2,
    ),
  );

  const primary = projects.find(
    (p) =>
      p.project.name === primaryName ||
      repoShortName(p.repository.baseRepoFullName) === primaryName,
  );
  if (!primary) {
    throw new Error(
      `Primary project "${primaryName}" not found among active projects`,
    );
  }

  const siblings = projects.filter((p) => p.project.id !== primary.project.id);
  const actor = "script:dogfood-consolidate-repos";

  if (!dryRun) {
    for (const sib of siblings) {
      await archiveProject(db, {
        workspaceId,
        projectId: sib.project.id,
        actor,
      });
      console.log(`archived+unbound ${sib.project.name}`);
    }

    await setProjectMultiRepoPolicy(db, {
      workspaceId,
      projectId: primary.project.id,
      policy: {
        enabled: true,
        maxSecondaryRepos: 5,
        maxSecondaryFiles: 40,
        coordinatedPrs: false,
      },
    });
    console.log("multi_repo_policy enabled on primary");

    const unbound = (await listRepositoryConnections(db, workspaceId)).filter(
      (c) => !c.projectId,
    );
    const byShort = new Map(
      unbound.map((c) => [repoShortName(c.baseRepoFullName), c]),
    );

    const attached = [];
    for (const name of secondaryNames) {
      const conn = byShort.get(name);
      if (!conn) {
        console.warn(`skip secondary ${name}: not unbound / not found`);
        continue;
      }
      try {
        const row = await attachSecondaryRepo(db, {
          workspaceId,
          projectId: primary.project.id,
          repositoryConnectionId: conn.id,
        });
        attached.push(row.baseRepoFullName);
        console.log(`attached secondary ${row.baseRepoFullName}`);
      } catch (err) {
        console.warn(
          `attach failed ${name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const afterRepos = await listReposForProject(
      db,
      workspaceId,
      primary.project.id,
    );
    console.log(
      JSON.stringify(
        {
          primary: {
            id: primary.project.id,
            name: primary.project.name,
          },
          repos: afterRepos.map((r) => ({
            fullName: r.baseRepoFullName,
            role: r.repoRole,
          })),
          attached,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      JSON.stringify(
        {
          wouldArchive: siblings.map((s) => s.project.name),
          wouldAttach: secondaryNames,
        },
        null,
        2,
      ),
    );
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb(db);
}
