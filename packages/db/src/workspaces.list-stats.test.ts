import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { projects } from "./schema.js";
import {
  createWorkspaceWithOwner,
  insertTestUser,
  listWorkspacesForUserWithStats,
  workspaceListBlurb,
} from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("listWorkspacesForUserWithStats", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let ownerId = "";
  let strangerId = "";
  let workspaceId = "";

  before(async () => {
    const owner = await insertTestUser(db, {
      login: `owner-stats-${Date.now()}`,
      githubUserId: `gh-owner-stats-${Date.now()}`,
    });
    const stranger = await insertTestUser(db, {
      login: `stranger-stats-${Date.now()}`,
      githubUserId: `gh-stranger-stats-${Date.now()}`,
    });
    ownerId = owner.id;
    strangerId = stranger.id;
    const created = await createWorkspaceWithOwner(db, {
      name: "Stats Lab",
      ownerUserId: ownerId,
    });
    workspaceId = created.workspace.id;
    const now = new Date();
    await db.insert(projects).values({
      id: crypto.randomUUID(),
      workspaceId,
      name: "stats-project",
      mode: "new_product",
      status: "active",
      stack: "nextjs_ts",
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("returns counts for members and nothing for strangers", async () => {
    const ownerList = await listWorkspacesForUserWithStats(db, ownerId);
    const row = ownerList.find((w) => w.workspace.id === workspaceId);
    assert.ok(row);
    assert.equal(row.projectCount, 1);
    assert.equal(row.memberCount, 1);
    assert.equal(row.agentCount, 0);
    assert.equal(row.runCount, 0);
    assert.equal(row.pendingApprovalCount, 0);
    assert.equal(row.role, "owner");

    const strangerList = await listWorkspacesForUserWithStats(db, strangerId);
    assert.equal(
      strangerList.some((w) => w.workspace.id === workspaceId),
      false,
    );
  });

  it("derives list blurb from slug", () => {
    assert.equal(workspaceListBlurb("acme"), "Workspace · /acme");
  });
});
