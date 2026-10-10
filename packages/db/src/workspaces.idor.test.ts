import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  createWorkspaceWithOwner,
  getWorkspaceForMember,
  insertTestUser,
  listWorkspacesForUser,
  updateWorkspaceForOwner,
} from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("workspace IDOR isolation", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let ownerId = "";
  let strangerId = "";
  let workspaceId = "";

  before(async () => {
    const owner = await insertTestUser(db, {
      login: `owner-idor-${Date.now()}`,
      githubUserId: `gh-owner-${Date.now()}`,
    });
    const stranger = await insertTestUser(db, {
      login: `stranger-idor-${Date.now()}`,
      githubUserId: `gh-stranger-${Date.now()}`,
    });
    ownerId = owner.id;
    strangerId = stranger.id;
    const created = await createWorkspaceWithOwner(db, {
      name: "IDOR Lab",
      ownerUserId: ownerId,
    });
    workspaceId = created.workspace.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("lists workspace only for members", async () => {
    const ownerList = await listWorkspacesForUser(db, ownerId);
    assert.equal(
      ownerList.some((w) => w.workspace.id === workspaceId),
      true,
    );
    const strangerList = await listWorkspacesForUser(db, strangerId);
    assert.equal(
      strangerList.some((w) => w.workspace.id === workspaceId),
      false,
    );
  });

  it("get fails closed for non-members", async () => {
    const ownerView = await getWorkspaceForMember(db, workspaceId, ownerId);
    assert.ok(ownerView);
    assert.equal(ownerView.role, "owner");

    const leaked = await getWorkspaceForMember(db, workspaceId, strangerId);
    assert.equal(leaked, undefined);
  });

  it("settings update fails closed for non-owners", async () => {
    const denied = await updateWorkspaceForOwner(
      db,
      workspaceId,
      strangerId,
      { name: "Hijacked" },
    );
    assert.equal(denied, undefined);

    const updated = await updateWorkspaceForOwner(db, workspaceId, ownerId, {
      name: "IDOR Lab Safe",
      autonomyDefault: "L1",
    });
    assert.ok(updated);
    assert.equal(updated.workspace.name, "IDOR Lab Safe");
    assert.equal(updated.workspace.autonomyDefault, "L1");
  });
});
