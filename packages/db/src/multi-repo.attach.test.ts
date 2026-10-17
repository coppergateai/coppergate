import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import {
  attachSecondaryRepo,
  createProjectWithRepo,
  detachSecondaryRepo,
  listReposForProject,
  ProjectBindError,
  promotePrimaryRepo,
  setProjectMultiRepoPolicy,
} from "./projects.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("multi-repo attach", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let primaryConn = "";
  let secondaryConn = "";
  let projectId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `mrepo-${stamp}`,
      githubUserId: `gh-mrepo-${stamp}`,
    });
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "MultiRepo WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-mrepo-${stamp}`,
      accountLogin: "org-mrepo",
      status: "active",
    });

    primaryConn = (
      await connectRepository(db, {
        workspaceId,
        installationId: install.id,
        githubRepoId: "901",
        owner: "org-mrepo",
        name: "primary",
        defaultBranch: "main",
        baseRepoFullName: "org-mrepo/primary",
      })
    ).id;

    secondaryConn = (
      await connectRepository(db, {
        workspaceId,
        installationId: install.id,
        githubRepoId: "902",
        owner: "org-mrepo",
        name: "secondary",
        defaultBranch: "main",
        baseRepoFullName: "org-mrepo/secondary",
      })
    ).id;

    const created = await createProjectWithRepo(db, {
      workspaceId,
      name: "Product",
      mode: "existing_repo",
      repositoryConnectionId: primaryConn,
      stack: "nextjs_ts",
    });
    projectId = created.project.id;
    assert.equal(created.repository.repoRole, "primary");
  });

  after(async () => {
    await closeDb(db);
  });

  it("rejects secondary attach when policy disabled", async () => {
    await assert.rejects(
      () =>
        attachSecondaryRepo(db, {
          workspaceId,
          projectId,
          repositoryConnectionId: secondaryConn,
        }),
      (err: unknown) =>
        err instanceof ProjectBindError && err.code === "multi_repo_disabled",
    );
  });

  it("attaches secondary when policy enabled", async () => {
    await setProjectMultiRepoPolicy(db, {
      workspaceId,
      projectId,
      policy: { enabled: true, maxSecondaryRepos: 2, coordinatedPrs: false },
    });
    const attached = await attachSecondaryRepo(db, {
      workspaceId,
      projectId,
      repositoryConnectionId: secondaryConn,
    });
    assert.equal(attached.repoRole, "secondary");
    assert.equal(attached.projectId, projectId);

    const repos = await listReposForProject(db, workspaceId, projectId);
    assert.equal(repos.length, 2);
  });

  it("promotes secondary to primary", async () => {
    const result = await promotePrimaryRepo(db, {
      workspaceId,
      projectId,
      repositoryConnectionId: secondaryConn,
    });
    assert.equal(result.primary.id, secondaryConn);
    assert.equal(result.primary.repoRole, "primary");
    assert.equal(result.previous.id, primaryConn);
    assert.equal(result.previous.repoRole, "secondary");
  });

  it("detaches secondary (previous primary after promote)", async () => {
    const detached = await detachSecondaryRepo(db, {
      workspaceId,
      projectId,
      repositoryConnectionId: primaryConn,
    });
    assert.equal(detached.projectId, null);
    const repos = await listReposForProject(db, workspaceId, projectId);
    assert.equal(repos.length, 1);
    assert.equal(repos[0]?.id, secondaryConn);
  });
});
