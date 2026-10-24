import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ensureArenaForProject,
  getArenaForProject,
  listContendersForArena,
  MAX_TOURNAMENT_FANOUT,
} from "./arena.js";
import { closeDb, createDb } from "./client.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { createProjectWithRepo } from "./projects.js";
import {
  applySpawnProfilesToArena,
  FULL_ARENA_PROFILE_KEYS,
} from "./profiles.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("applySpawnProfilesToArena full roster", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `spawn-${stamp}`,
      githubUserId: `gh-spawn-${stamp}`,
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

    // Start with a narrow 2-slot arena (legacy sole-dev shape).
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

  it("expands a 2-slot arena to the full bounded roster", async () => {
    assert.ok(FULL_ARENA_PROFILE_KEYS.length >= 11);
    assert.equal(MAX_TOURNAMENT_FANOUT, FULL_ARENA_PROFILE_KEYS.length);

    await applySpawnProfilesToArena(db, {
      workspaceId,
      projectId,
      actor,
      profileKeys: FULL_ARENA_PROFILE_KEYS,
    });

    const arena = await getArenaForProject(db, { workspaceId, projectId });
    assert.ok(arena);

    const pool = await listContendersForArena(db, {
      workspaceId,
      arenaId: arena.id,
    });
    const active = pool.filter((c) => c.status === "ACTIVE");
    assert.equal(active.length, FULL_ARENA_PROFILE_KEYS.length);

    const keys = active.map((c) => c.profileKey).sort();
    assert.deepEqual(keys, [...FULL_ARENA_PROFILE_KEYS].sort());

    const orphans = active.filter((c) => c.profileKey.includes("_"));
    assert.equal(orphans.length, 0);
  });
});
