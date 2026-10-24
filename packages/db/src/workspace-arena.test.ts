import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  closeDb,
  connectRepository,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  getArenaForProject,
  insertTestUser,
  listWorkspaceArenaSnapshot,
  startWorkspaceArena,
  stopWorkspaceArena,
  upsertGithubInstallation,
} from "./index.js";

const url = process.env.DATABASE_URL;

describe("workspace arena fan-out", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectA = "";
  let projectB = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `ws-arena-${stamp}`,
      githubUserId: `gh-ws-arena-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Workspace Arena WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-ws-arena-${stamp}`,
      accountLogin: "org-ws-arena",
      status: "active",
    });

    const connA = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: String(930_000 + (stamp % 1000)),
      owner: "org-ws-arena",
      name: "repo-a",
      defaultBranch: "main",
      baseRepoFullName: "org-ws-arena/repo-a",
    });
    projectA = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Arena A",
        mode: "existing_repo",
        repositoryConnectionId: connA.id,
        stack: "go",
      })
    ).project.id;

    const connB = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: String(931_000 + (stamp % 1000)),
      owner: "org-ws-arena",
      name: "repo-b",
      defaultBranch: "main",
      baseRepoFullName: "org-ws-arena/repo-b",
    });
    projectB = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Arena B",
        mode: "existing_repo",
        repositoryConnectionId: connB.id,
        stack: "nextjs_ts",
      })
    ).project.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("lists lanes and fan-out start/stop across projects", async () => {
    const before = await listWorkspaceArenaSnapshot(db, workspaceId);
    assert.equal(before.status, "STOPPED");
    assert.equal(before.projects.length, 2);

    const started = await startWorkspaceArena(db, { workspaceId, actor });
    assert.equal(started.started, 2);
    assert.equal(started.errors.length, 0);
    assert.equal(started.status, "LIVE");

    const arenaA = await getArenaForProject(db, {
      workspaceId,
      projectId: projectA,
    });
    const arenaB = await getArenaForProject(db, {
      workspaceId,
      projectId: projectB,
    });
    assert.ok(arenaA);
    assert.ok(arenaB);
    assert.ok(
      arenaA!.status === "RUNNING" || arenaA!.status === "ARMED",
      `A status ${arenaA!.status}`,
    );
    assert.ok(
      arenaB!.status === "RUNNING" || arenaB!.status === "ARMED",
      `B status ${arenaB!.status}`,
    );

    const snap = await listWorkspaceArenaSnapshot(db, workspaceId);
    assert.equal(snap.status, "LIVE");
    assert.ok(snap.projects.every((p) => p.contenders.length >= 1));

    const stopped = await stopWorkspaceArena(db, { workspaceId, actor });
    assert.equal(stopped.stopped, 2);
    assert.equal(stopped.errors.length, 0);
    assert.equal(stopped.status, "STOPPED");

    const afterA = await getArenaForProject(db, {
      workspaceId,
      projectId: projectA,
    });
    const afterB = await getArenaForProject(db, {
      workspaceId,
      projectId: projectB,
    });
    assert.equal(afterA?.status, "PAUSED");
    assert.equal(afterB?.status, "PAUSED");
  });
});
