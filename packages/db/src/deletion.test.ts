import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./client.js";
import {
  archiveProject,
  purgeExpiredSoftDeletedWorkspaces,
  softDeleteWorkspace,
} from "./deletion.js";
import {
  connectRepository,
  getInstallationForWorkspace,
  upsertGithubInstallation,
} from "./github.js";
import { createProjectWithRepo } from "./projects.js";
import { auditEvents, githubInstallations } from "./schema.js";
import {
  createWorkspaceWithOwner,
  getWorkspaceForMember,
  insertTestUser,
  listWorkspacesForUser,
} from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("deletion controls", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let ownerId = "";
  let workspaceId = "";
  let projectId = "";

  before(async () => {
    const stamp = Date.now();
    const owner = await insertTestUser(db, {
      login: `del-${stamp}`,
      githubUserId: `gh-del-${stamp}`,
    });
    ownerId = owner.id;
    const created = await createWorkspaceWithOwner(db, {
      name: `Delete Me ${stamp}`,
      ownerUserId: ownerId,
    });
    workspaceId = created.workspace.id;

    const installation = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-del-${stamp}`,
      accountLogin: "acme",
      accountType: "Organization",
      encryptedToken: "sealed.token.should.purge",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: installation.id,
      githubRepoId: `${stamp}`,
      owner: "acme",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "acme/app",
    });
    const project = await createProjectWithRepo(db, {
      workspaceId,
      name: "To archive",
      mode: "existing_repo",
      repositoryConnectionId: conn.id,
    });
    projectId = project.project.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("archives a project and audits", async () => {
    const archived = await archiveProject(db, {
      workspaceId,
      projectId,
      actor: ownerId,
    });
    assert.equal(archived.status, "archived");

    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId));
    assert.ok(audits.some((a) => a.action === "project.archived"));
  });

  it("soft-deletes workspace, purges tokens, hides from list", async () => {
    const deleted = await softDeleteWorkspace(db, {
      workspaceId,
      actor: ownerId,
    });
    assert.equal(deleted.status, "deleted");
    assert.ok(deleted.deletedAt);

    const install = await getInstallationForWorkspace(db, workspaceId);
    assert.equal(install, undefined);

    const [rawInstall] = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.workspaceId, workspaceId))
      .limit(1);
    assert.ok(rawInstall);
    assert.equal(rawInstall.status, "removed");
    assert.equal(rawInstall.encryptedToken, null);

    const listed = await listWorkspacesForUser(db, ownerId);
    assert.equal(
      listed.some((w) => w.workspace.id === workspaceId),
      false,
    );
    const member = await getWorkspaceForMember(db, workspaceId, ownerId);
    assert.equal(member, undefined);

    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId));
    assert.ok(audits.some((a) => a.action === "workspace.deleted"));
    assert.ok(audits.some((a) => a.action === "credentials.purged"));
  });

  it("hard-purges expired soft-deleted workspaces", async () => {
    const result = await purgeExpiredSoftDeletedWorkspaces(db, {
      now: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
      retentionMs: 30 * 24 * 60 * 60 * 1000,
    });
    assert.ok(result.workspaceIds.includes(workspaceId));
    assert.ok(result.purged >= 1);

    const [gone] = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.workspaceId, workspaceId))
      .limit(1);
    assert.equal(gone, undefined);
  });
});
