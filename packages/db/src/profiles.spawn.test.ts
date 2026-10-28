import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ensureArenaForProject,
  getArenaForProject,
  listContendersForArena,
  MIN_DUEL_CONTENDERS,
} from "./arena.js";
import { closeDb, createDb } from "./client.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { createProjectWithRepo } from "./projects.js";
import { applySpawnProfilesToArena } from "./profiles.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("applySpawnProfilesToArena peer seats", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `spawn-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Spawn WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-spawn-${stamp}`,
      accountLogin: "org-spawn",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "902",
      owner: "org-spawn",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-spawn/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Spawn App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: 2,
      contenderCount: 2,
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("arms primary-role peers and clears cross-role sticky seats", async () => {
    await applySpawnProfilesToArena(db, {
      workspaceId,
      projectId,
      actor,
      profileKeys: ["fixer", "qa"],
      seatCount: MIN_DUEL_CONTENDERS,
    });

    const arena = await getArenaForProject(db, { workspaceId, projectId });
    assert.ok(arena);

    const pool = await listContendersForArena(db, {
      workspaceId,
      arenaId: arena.id,
    });
    const active = pool.filter((c) => c.status === "ACTIVE");
    assert.equal(active.length, MIN_DUEL_CONTENDERS);
    assert.ok(active.every((c) => c.profileKey === "fixer"));
    assert.equal(new Set(active.map((c) => c.strategy)).size, active.length);
    assert.equal(active.filter((c) => c.profileKey === "qa").length, 0);
  });
});
