import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  classifyContenderRuntime,
  closeDb,
  connectRepository,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  getArenaForProject,
  insertTestUser,
  killWorkspaceArena,
  listWorkspaceArenaSnapshot,
  startWorkspaceArena,
  stopWorkspaceArena,
  upsertGithubInstallation,
  type WorkspaceArenaContenderRun,
} from "./index.js";

const url = process.env.DATABASE_URL;

function runStub(
  overrides: Partial<WorkspaceArenaContenderRun> & { status: string },
): WorkspaceArenaContenderRun {
  return {
    id: "run-1",
    taskId: "task-1",
    taskTitle: "Stub",
    actualCostMicros: 0,
    prUrl: null,
    prNumber: null,
    errorCode: null,
    tournamentResult: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("classifyContenderRuntime", () => {
  it("treats CANCELLED as idle even with errorCode", () => {
    assert.equal(
      classifyContenderRuntime(
        runStub({ status: "CANCELLED", errorCode: "incomplete" }),
        1_000_000,
      ),
      "idle",
    );
  });

  it("flags FAILED / BLOCKED / EXPIRED as needsAttention when arena is live", () => {
    assert.equal(
      classifyContenderRuntime(runStub({ status: "FAILED" }), 1_000_000, {
        arenaLive: true,
      }),
      "needsAttention",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "BLOCKED" }), 1_000_000, {
        arenaLive: true,
      }),
      "needsAttention",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "EXPIRED" }), 1_000_000, {
        arenaLive: true,
      }),
      "needsAttention",
    );
  });

  it("quiets terminal failures when arena is not live", () => {
    assert.equal(
      classifyContenderRuntime(runStub({ status: "FAILED" }), 1_000_000, {
        arenaLive: false,
      }),
      "idle",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "BLOCKED" }), 1_000_000, {
        arenaLive: false,
      }),
      "idle",
    );
  });

  it("flags stuck VALIDATING as needsAttention when arena is not live", () => {
    assert.equal(
      classifyContenderRuntime(runStub({ status: "VALIDATING" }), 1_000_000, {
        arenaLive: false,
      }),
      "needsAttention",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "WAITING_CI" }), 1_000_000, {
        arenaLive: false,
      }),
      "needsAttention",
    );
    assert.equal(
      classifyContenderRuntime(
        runStub({ status: "REVIEW_REQUIRED" }),
        1_000_000,
        { arenaLive: false },
      ),
      "awaitingCi",
    );
  });

  it("does not treat SUCCEEDED + errorCode as needsAttention", () => {
    assert.equal(
      classifyContenderRuntime(
        runStub({ status: "SUCCEEDED", errorCode: "stale_warning" }),
        1_000_000,
      ),
      "idle",
    );
  });

  it("treats exhausted budget alone as idle (selection, not ops fire)", () => {
    assert.equal(
      classifyContenderRuntime(null, 0, { arenaLive: true }),
      "idle",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "SUCCEEDED" }), 0, {
        arenaLive: true,
      }),
      "idle",
    );
    // Live failure still escalates even when budget is gone.
    assert.equal(
      classifyContenderRuntime(runStub({ status: "FAILED" }), 0, {
        arenaLive: true,
      }),
      "needsAttention",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "FAILED" }), 0, {
        arenaLive: false,
      }),
      "idle",
    );
  });

  it("quiets tournament losers, stub delivery, eliminated, and stale failures", () => {
    const now = Date.parse("2026-10-24T19:00:00.000Z");
    assert.equal(
      classifyContenderRuntime(
        runStub({ status: "FAILED", tournamentResult: "LOSER" }),
        1,
        { arenaLive: true, nowMs: now },
      ),
      "idle",
    );
    assert.equal(
      classifyContenderRuntime(
        runStub({ status: "FAILED", errorCode: "stub_delivery" }),
        1,
        { arenaLive: true, nowMs: now },
      ),
      "idle",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "FAILED" }), 1, {
        arenaLive: true,
        contenderStatus: "ELIMINATED",
        nowMs: now,
      }),
      "idle",
    );
    assert.equal(
      classifyContenderRuntime(
        runStub({
          status: "FAILED",
          errorCode: "incomplete",
          updatedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        }),
        1,
        { arenaLive: true, nowMs: now },
      ),
      "idle",
    );
    assert.equal(
      classifyContenderRuntime(
        runStub({
          status: "FAILED",
          errorCode: "incomplete",
          updatedAt: new Date(now - 30 * 60 * 1000).toISOString(),
        }),
        1,
        { arenaLive: true, nowMs: now },
      ),
      "needsAttention",
    );
  });

  it("maps live and CI statuses", () => {
    assert.equal(
      classifyContenderRuntime(runStub({ status: "RUNNING" }), 1),
      "running",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "QUEUED" }), 1),
      "running",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "WAITING_CI" }), 1, {
        arenaLive: true,
      }),
      "awaitingCi",
    );
    assert.equal(
      classifyContenderRuntime(runStub({ status: "VALIDATING" }), 1, {
        arenaLive: true,
      }),
      "awaitingCi",
    );
  });
});

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

  it("lists lanes and fan-out start/pause/kill across projects", async () => {
    const before = await listWorkspaceArenaSnapshot(db, workspaceId);
    assert.equal(before.status, "STOPPED");
    assert.equal(before.projects.length, 2);
    assert.ok(before.syncedAt);
    assert.ok(before.summary);

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
    assert.ok(
      snap.projects.every((p) =>
        p.contenders.every((c) => "latestRun" in c),
      ),
    );

    const paused = await stopWorkspaceArena(db, { workspaceId, actor });
    assert.equal(paused.paused, 2);
    assert.equal(paused.errors.length, 0);
    assert.equal(paused.status, "STOPPED");

    const afterPauseA = await getArenaForProject(db, {
      workspaceId,
      projectId: projectA,
    });
    const afterPauseB = await getArenaForProject(db, {
      workspaceId,
      projectId: projectB,
    });
    assert.equal(afterPauseA?.status, "PAUSED");
    assert.equal(afterPauseB?.status, "PAUSED");

    await startWorkspaceArena(db, { workspaceId, actor });
    const killed = await killWorkspaceArena(db, { workspaceId, actor });
    assert.equal(killed.stopped, 2);
    assert.equal(killed.errors.length, 0);
    assert.equal(killed.status, "STOPPED");

    const afterKillA = await getArenaForProject(db, {
      workspaceId,
      projectId: projectA,
    });
    const afterKillB = await getArenaForProject(db, {
      workspaceId,
      projectId: projectB,
    });
    assert.equal(afterKillA?.status, "KILLED");
    assert.equal(afterKillB?.status, "KILLED");
  });
});
