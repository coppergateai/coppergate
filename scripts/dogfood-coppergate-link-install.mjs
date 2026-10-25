#!/usr/bin/env node
/**
 * Transfer the existing coppergateai GitHub App install from the old staging
 * workspace onto the coppergate self-pilot workspace, sync repos, create the
 * primary project, and clone the default BYOK credential from kprompt.
 *
 * Usage (Fly worker / prod DATABASE_URL):
 *   pnpm --filter @coppergate/db exec node --import tsx \
 *     ../../scripts/dogfood-coppergate-link-install.mjs
 */
import {
  closeDb,
  createDb,
  createProjectWithRepo,
  updateInstallationToken,
} from "../packages/db/src/index.ts";
import {
  githubInstallations,
  integrationCredentials,
  projects,
  repositoryConnections,
} from "../packages/db/src/schema.ts";
import { and, eq, isNull } from "drizzle-orm";
import {
  createAppJwt,
  createInstallationAccessToken,
  listInstallationRepos,
  parseEncryptionKey,
  sealSecret,
} from "../packages/github/src/index.ts";

const COPPERGATE_WS = "2c894510-810e-46cc-8ff0-652f63870639";
const KPROMPT_WS = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";
const STAGING_WS = "f9c8a49b-4742-4f4b-accd-6d6037cffa5a";
const STAGING_INSTALL = "1f54e25d-efbc-4e66-a46a-884a1855a7ce";
const PRIMARY_FULL = "coppergateai/coppergate";
const ARCH_FULL = "coppergateai/coppergate-architecture";
const actor = "script:dogfood-coppergate-link-install";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  const [install] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.id, STAGING_INSTALL))
    .limit(1);
  if (!install) throw new Error("staging coppergateai install missing");
  if (install.accountLogin !== "coppergateai") {
    throw new Error(`unexpected account ${install.accountLogin}`);
  }

  // Unbind staging smoke project from its repo so we can rehome connections.
  await db
    .update(repositoryConnections)
    .set({ projectId: null, updatedAt: new Date() })
    .where(eq(repositoryConnections.installationId, STAGING_INSTALL));

  // Move install + connections to coppergate workspace.
  if (install.workspaceId !== COPPERGATE_WS) {
    await db
      .update(githubInstallations)
      .set({ workspaceId: COPPERGATE_WS, updatedAt: new Date() })
      .where(eq(githubInstallations.id, STAGING_INSTALL));
  }
  await db
    .update(repositoryConnections)
    .set({ workspaceId: COPPERGATE_WS, updatedAt: new Date() })
    .where(eq(repositoryConnections.installationId, STAGING_INSTALL));

  // Mint installation token and sync repos.
  const jwt = await createAppJwt({
    appId: process.env.GITHUB_APP_ID,
    slug: process.env.GITHUB_APP_SLUG,
    privateKeyPem: process.env.GITHUB_APP_PRIVATE_KEY,
  });
  const minted = await createInstallationAccessToken(
    jwt,
    Number(install.githubInstallationId),
  );
  const key = parseEncryptionKey(process.env.CREDENTIALS_ENCRYPTION_KEY);
  await updateInstallationToken(
    db,
    STAGING_INSTALL,
    sealSecret(minted.token, key),
    minted.expiresAt,
  );

  const repos = await listInstallationRepos(minted.token);
  const now = new Date();
  const upserted = [];
  for (const repo of repos) {
    const [existing] = await db
      .select()
      .from(repositoryConnections)
      .where(
        and(
          eq(repositoryConnections.workspaceId, COPPERGATE_WS),
          eq(repositoryConnections.githubRepoId, String(repo.id)),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(repositoryConnections)
        .set({
          owner: repo.owner.login,
          name: repo.name,
          defaultBranch: repo.default_branch,
          baseRepoFullName: repo.full_name,
          installationStatus: "active",
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(repositoryConnections.id, existing.id));
      upserted.push({ id: existing.id, full: repo.full_name, created: false });
      continue;
    }
    const id = crypto.randomUUID();
    await db.insert(repositoryConnections).values({
      id,
      workspaceId: COPPERGATE_WS,
      installationId: STAGING_INSTALL,
      provider: "github",
      githubRepoId: String(repo.id),
      owner: repo.owner.login,
      name: repo.name,
      defaultBranch: repo.default_branch,
      baseRepoFullName: repo.full_name,
      installationStatus: "active",
      projectId: null,
      repoRole: "primary",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    upserted.push({ id, full: repo.full_name, created: true });
  }

  // Ensure coppergate + architecture rows exist even if App only has subset —
  // list may omit if not granted; surface available names.
  const available = repos.map((r) => r.full_name).sort();
  const [primaryConn] = await db
    .select()
    .from(repositoryConnections)
    .where(
      and(
        eq(repositoryConnections.workspaceId, COPPERGATE_WS),
        eq(repositoryConnections.baseRepoFullName, PRIMARY_FULL),
        isNull(repositoryConnections.projectId),
      ),
    )
    .limit(1);

  let project = null;
  if (primaryConn) {
    const existingProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, COPPERGATE_WS),
          eq(projects.name, "coppergate"),
        ),
      )
      .limit(1);
    if (existingProjects[0]) {
      project = existingProjects[0];
    } else {
      const created = await createProjectWithRepo(db, {
        workspaceId: COPPERGATE_WS,
        repositoryConnectionId: primaryConn.id,
        name: "coppergate",
        mode: "existing_repo",
        stack: "nextjs_ts",
        autonomyLevel: "L1",
        actor,
      });
      project = created.project;
    }
  }

  // Clone default BYOK from kprompt (same encryption key → sealed payload reusable).
  const [source] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.workspaceId, KPROMPT_WS),
        eq(integrationCredentials.provider, "llm_byok"),
        eq(integrationCredentials.isDefault, true),
        eq(integrationCredentials.status, "active"),
      ),
    )
    .limit(1);
  let byok = null;
  if (source) {
    const [existingByok] = await db
      .select()
      .from(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.workspaceId, COPPERGATE_WS),
          eq(integrationCredentials.provider, "llm_byok"),
          eq(integrationCredentials.label, source.label),
        ),
      )
      .limit(1);
    if (existingByok) {
      byok = { id: existingByok.id, label: existingByok.label, cloned: false };
    } else {
      const id = crypto.randomUUID();
      await db.insert(integrationCredentials).values({
        id,
        workspaceId: COPPERGATE_WS,
        provider: "llm_byok",
        label: source.label,
        vendor: source.vendor,
        encryptedPayload: source.encryptedPayload,
        baseUrl: source.baseUrl,
        model: source.model,
        isDefault: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      byok = { id, label: source.label, cloned: true, model: source.model };
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: Boolean(project),
        installMovedTo: COPPERGATE_WS,
        availableRepos: available,
        upserted,
        primary: PRIMARY_FULL,
        project: project
          ? { id: project.id, name: project.name, status: project.status }
          : null,
        byok,
        stagingWorkspaceLeft: STAGING_WS,
        next:
          project == null
            ? "Grant coppergateai/coppergate to GitHub App install 170733192 (Reconfigure), re-run this script"
            : "Run dogfood-coppergate-boot.mjs --start then dogfood-coppergate-prove.mjs --enable-maintainer",
      },
      null,
      2,
    ),
  );
  process.exitCode = project ? 0 : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
