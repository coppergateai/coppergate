import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  connectRepository,
  getRepositoryConnectionForWorkspace,
  listRepositoryConnections,
  revokeRepositoryConnection,
  upsertGithubInstallation,
} from "./github.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("github connection IDOR", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let ownerA = "";
  let ownerB = "";
  let workspaceA = "";
  let workspaceB = "";
  let connectionA = "";

  before(async () => {
    const stamp = Date.now();
    const a = await insertTestUser(db, {
      login: `gh-a-${stamp}`,
      githubUserId: `gh-a-${stamp}`,
    });
    const b = await insertTestUser(db, {
      login: `gh-b-${stamp}`,
      githubUserId: `gh-b-${stamp}`,
    });
    ownerA = a.id;
    ownerB = b.id;

    workspaceA = (
      await createWorkspaceWithOwner(db, {
        name: "WS A",
        ownerUserId: ownerA,
      })
    ).workspace.id;
    workspaceB = (
      await createWorkspaceWithOwner(db, {
        name: "WS B",
        ownerUserId: ownerB,
      })
    ).workspace.id;

    const installA = await upsertGithubInstallation(db, {
      workspaceId: workspaceA,
      githubInstallationId: `inst-a-${stamp}`,
      accountLogin: "org-a",
      encryptedToken: "sealed.dummy.token",
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    const conn = await connectRepository(db, {
      workspaceId: workspaceA,
      installationId: installA.id,
      githubRepoId: "101",
      owner: "org-a",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-a/app",
    });
    connectionA = conn.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("does not list another workspace's repos", async () => {
    const forB = await listRepositoryConnections(db, workspaceB);
    assert.equal(
      forB.some((c) => c.id === connectionA),
      false,
    );
  });

  it("get/revoke fail closed across workspaces", async () => {
    const leaked = await getRepositoryConnectionForWorkspace(
      db,
      workspaceB,
      connectionA,
    );
    assert.equal(leaked, undefined);

    const revoked = await revokeRepositoryConnection(
      db,
      workspaceB,
      connectionA,
    );
    // UPDATE ... WHERE workspace_id = B matches nothing → undefined
    assert.equal(revoked, undefined);

    const stillThere = await getRepositoryConnectionForWorkspace(
      db,
      workspaceA,
      connectionA,
    );
    assert.ok(stillThere);
  });
});
