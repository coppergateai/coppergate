/**
 * Transfer coppergateai GitHub App install → coppergate workspace,
 * sync repos, create primary project, clone default BYOK from kprompt.
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
  integrationCredentials,
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
const KPROMPT_WS = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";
/** Live coppergateai org App install (gh api orgs/coppergateai/installations). */
const GH_INSTALLATION_ID = "172191459";
const PRIMARY_FULL = "coppergateai/coppergate";
const actor = "script:link-coppergate-install";

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
  const key = parseEncryptionKey(process.env.CREDENTIALS_ENCRYPTION_KEY!);
  const sealed = sealSecret(minted.token, key);
  const now = new Date();

  const [installByGh] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.githubInstallationId, GH_INSTALLATION_ID))
    .limit(1);
  const [installByWs] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.workspaceId, COPPERGATE_WS))
    .limit(1);

  let install = installByGh ?? installByWs ?? null;

  if (installByGh && installByGh.workspaceId !== COPPERGATE_WS) {
    // Live GH install row lives on another workspace — move it.
    if (installByWs && installByWs.id !== installByGh.id) {
      await db
        .update(repositoryConnections)
        .set({ installationId: installByGh.id, updatedAt: now })
        .where(eq(repositoryConnections.installationId, installByWs.id));
      await db
        .delete(githubInstallations)
        .where(eq(githubInstallations.id, installByWs.id));
    }
    await db
      .update(repositoryConnections)
      .set({ projectId: null, updatedAt: now })
      .where(eq(repositoryConnections.installationId, installByGh.id));
    await db
      .update(githubInstallations)
      .set({
        workspaceId: COPPERGATE_WS,
        accountLogin: "coppergateai",
        status: "active",
        encryptedToken: sealed,
        tokenExpiresAt: minted.expiresAt,
        updatedAt: now,
      })
      .where(eq(githubInstallations.id, installByGh.id));
    await db
      .update(repositoryConnections)
      .set({ workspaceId: COPPERGATE_WS, updatedAt: now })
      .where(eq(repositoryConnections.installationId, installByGh.id));
    install = installByGh;
  } else if (installByWs && installByWs.githubInstallationId !== GH_INSTALLATION_ID) {
    // Workspace has a stale GH install id — rebind to the live org install.
    await db
      .update(githubInstallations)
      .set({
        githubInstallationId: GH_INSTALLATION_ID,
        accountLogin: "coppergateai",
        accountType: "Organization",
        status: "active",
        encryptedToken: sealed,
        tokenExpiresAt: minted.expiresAt,
        updatedAt: now,
      })
      .where(eq(githubInstallations.id, installByWs.id));
    install = { ...installByWs, githubInstallationId: GH_INSTALLATION_ID };
  } else if (!install) {
    const installId = crypto.randomUUID();
    await db.insert(githubInstallations).values({
      id: installId,
      workspaceId: COPPERGATE_WS,
      provider: "github",
      githubInstallationId: GH_INSTALLATION_ID,
      accountLogin: "coppergateai",
      accountType: "Organization",
      status: "active",
      encryptedToken: sealed,
      tokenExpiresAt: minted.expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    install = (
      await db
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, installId))
        .limit(1)
    )[0]!;
  } else {
    await updateInstallationToken(
      db,
      install.id,
      sealed,
      minted.expiresAt,
    );
  }

  if (!install) throw new Error("failed to bind github installation");

  const repos = await listInstallationRepos(minted.token);
  const upserted: Array<{ id: string; full: string; created: boolean }> = [];
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
          installationId: install.id,
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
      installationId: install.id,
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

  let project: { id: string; name: string; status: string } | null = null;
  if (primaryConn) {
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, COPPERGATE_WS),
          eq(projects.name, "coppergate"),
        ),
      )
      .limit(1);
    if (existingProject) {
      project = existingProject;
    } else {
      const created = await createProjectWithRepo(db, {
        workspaceId: COPPERGATE_WS,
        repositoryConnectionId: primaryConn.id,
        name: "coppergate",
        mode: "existing_repo",
        stack: "nextjs_ts",
        autonomyLevel: "L1",
      });
      project = created.project;
      void actor;
    }
  }

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
  let byok: Record<string, unknown> | null = null;
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
        availableRepos: available,
        upserted,
        project,
        byok,
        next:
          project == null
            ? "Grant coppergateai/coppergate to App install 172191459, re-run"
            : "dogfood-coppergate-boot.mjs --start",
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
