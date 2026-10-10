import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  connectRepository,
  markInstallationRemoved,
  upsertGithubInstallation,
} from "./github.js";
import {
  createProjectWithRepo,
  ProjectBindError,
} from "./projects.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("project repo binding", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let connectionId = "";
  let connectionId2 = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `proj-${stamp}`,
      githubUserId: `gh-proj-${stamp}`,
    });
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Proj WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-proj-${stamp}`,
      accountLogin: "org-proj",
      status: "active",
    });

    connectionId = (
      await connectRepository(db, {
        workspaceId,
        installationId: install.id,
        githubRepoId: "201",
        owner: "org-proj",
        name: "app-a",
        defaultBranch: "main",
        baseRepoFullName: "org-proj/app-a",
      })
    ).id;

    connectionId2 = (
      await connectRepository(db, {
        workspaceId,
        installationId: install.id,
        githubRepoId: "202",
        owner: "org-proj",
        name: "app-b",
        defaultBranch: "main",
        baseRepoFullName: "org-proj/app-b",
      })
    ).id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("creates project with nextjs_ts stack and binds one repo", async () => {
    const created = await createProjectWithRepo(db, {
      workspaceId,
      name: "App A",
      mode: "existing_repo",
      repositoryConnectionId: connectionId,
    });
    assert.equal(created.project.stack, "nextjs_ts");
    assert.equal(created.repository.projectId, created.project.id);
    assert.ok(created.repository.compatibility?.includes("existing_repo"));
  });

  it("cannot bind the same repo to a second project", async () => {
    await assert.rejects(
      () =>
        createProjectWithRepo(db, {
          workspaceId,
          name: "App A again",
          mode: "new_product",
          repositoryConnectionId: connectionId,
        }),
      (err: unknown) =>
        err instanceof ProjectBindError && err.code === "repo_already_bound",
    );
  });

  it("blocks new projects when install is removed", async () => {
    await markInstallationRemoved(db, workspaceId);
    await assert.rejects(
      () =>
        createProjectWithRepo(db, {
          workspaceId,
          name: "Blocked",
          mode: "new_product",
          repositoryConnectionId: connectionId2,
        }),
      (err: unknown) =>
        err instanceof ProjectBindError && err.code === "install_inactive",
    );
  });
});
