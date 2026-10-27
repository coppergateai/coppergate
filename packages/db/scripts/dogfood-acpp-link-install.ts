#!/usr/bin/env node
/**
 * Ensure coppergateai/acpp is synced into the coppergate dogfood workspace
 * and create project "acpp" bound to that repo.
 *
 * Usage (prod DATABASE_URL + GitHub App env):
 *   DATABASE_URL=… node --import tsx scripts/dogfood-acpp-link-install.mjs
 */
import { and, eq, isNull } from "drizzle-orm";
import {
  closeDb,
  createDb,
  createProjectWithRepo,
  updateInstallationToken,
} from "../src/index.ts";
import {
  githubInstallations,
  projects,
  repositoryConnections,
} from "../src/schema.ts";
import {
  createAppJwt,
  createInstallationAccessToken,
  listInstallationRepos,
  parseEncryptionKey,
  sealSecret,
} from "../../github/src/index.ts";

const COPPERGATE_WS = "2c894510-810e-46cc-8ff0-652f63870639";
const GH_INSTALLATION_ID = "172191459";
const ACPP_FULL = "coppergateai/acpp";
const actor = "script:dogfood-acpp-link-install";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  const jwt = await createAppJwt({
    appId: process.env.GITHUB_APP_ID,
    slug: process.env.GITHUB_APP_SLUG,
    privateKeyPem: process.env.GITHUB_APP_PRIVATE_KEY,
  });
  const minted = await createInstallationAccessToken(
    jwt,
    Number(GH_INSTALLATION_ID),
  );
  const key = parseEncryptionKey(process.env.CREDENTIALS_ENCRYPTION_KEY);
  const sealed = sealSecret(minted.token, key);
  const now = new Date();

  const [install] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.workspaceId, COPPERGATE_WS))
    .limit(1);
  if (!install) throw new Error("coppergate workspace has no GitHub install");

  await updateInstallationToken(db, install.id, sealed, minted.expiresAt);

  const repos = await listInstallationRepos(minted.token);
  const available = repos.map((r) => r.full_name).sort();
  const acppRepo = repos.find((r) => r.full_name === ACPP_FULL);
  if (!acppRepo) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "acpp_not_on_installation",
          availableRepos: available,
          hint: `Add ${ACPP_FULL} to GitHub App install ${GH_INSTALLATION_ID} (Settings → Applications → Coppergate → Repository access), then re-run.`,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    process.exit();
  }

  const [existingConn] = await db
    .select()
    .from(repositoryConnections)
    .where(
      and(
        eq(repositoryConnections.workspaceId, COPPERGATE_WS),
        eq(repositoryConnections.baseRepoFullName, ACPP_FULL),
      ),
    )
    .limit(1);

  let connId = existingConn?.id ?? null;
  if (existingConn) {
    await db
      .update(repositoryConnections)
      .set({
        installationId: install.id,
        owner: acppRepo.owner.login,
        name: acppRepo.name,
        defaultBranch: acppRepo.default_branch,
        githubRepoId: String(acppRepo.id),
        installationStatus: "active",
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(repositoryConnections.id, existingConn.id));
  } else {
    connId = crypto.randomUUID();
    await db.insert(repositoryConnections).values({
      id: connId,
      workspaceId: COPPERGATE_WS,
      installationId: install.id,
      provider: "github",
      githubRepoId: String(acppRepo.id),
      owner: acppRepo.owner.login,
      name: acppRepo.name,
      defaultBranch: acppRepo.default_branch,
      baseRepoFullName: ACPP_FULL,
      installationStatus: "active",
      projectId: null,
      repoRole: "primary",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [existingProject] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.workspaceId, COPPERGATE_WS), eq(projects.name, "acpp")),
    )
    .limit(1);

  let project = existingProject;
  if (!project) {
    // Prefer unbound connection; if somehow bound, unbind first for create.
    const [unbound] = await db
      .select()
      .from(repositoryConnections)
      .where(
        and(
          eq(repositoryConnections.id, connId),
          isNull(repositoryConnections.projectId),
        ),
      )
      .limit(1);
    if (!unbound) {
      throw new Error(
        `Repo connection ${connId} already bound; cannot create project acpp`,
      );
    }
    const created = await createProjectWithRepo(db, {
      workspaceId: COPPERGATE_WS,
      repositoryConnectionId: unbound.id,
      name: "acpp",
      mode: "existing_repo",
      stack: "unknown",
      autonomyLevel: "L1",
    });
    project = created.project;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        actor,
        workspaceId: COPPERGATE_WS,
        project: { id: project.id, name: project.name, status: project.status },
        repo: ACPP_FULL,
        connectionId: connId,
        availableRepos: available,
        next: "dogfood-acpp-boot.mjs (WORKSPACE_SLUG=coppergate PRIMARY_NAME=acpp)",
      },
      null,
      2,
    ),
  );
  process.exitCode = 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
