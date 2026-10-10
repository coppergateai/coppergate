import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  listPendingApprovalsForWorkspace,
} from "./approvals.js";
import { createBriefDraft } from "./briefs.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { createProjectWithRepo } from "./projects.js";
import { closeDb, createDb } from "./client.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("approvals inbox IDOR", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let wsA = "";
  let wsB = "";
  let projectA = "";
  let actorA = "";

  before(async () => {
    const stamp = Date.now();
    const userA = await insertTestUser(db, {
      login: `appr-a-${stamp}`,
      githubUserId: `gh-appr-a-${stamp}`,
    });
    const userB = await insertTestUser(db, {
      login: `appr-b-${stamp}`,
      githubUserId: `gh-appr-b-${stamp}`,
    });
    actorA = userA.id;

    wsA = (
      await createWorkspaceWithOwner(db, {
        name: "Appr A",
        ownerUserId: userA.id,
      })
    ).workspace.id;
    wsB = (
      await createWorkspaceWithOwner(db, {
        name: "Appr B",
        ownerUserId: userB.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId: wsA,
      githubInstallationId: `inst-appr-${stamp}`,
      accountLogin: "org-appr",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId: wsA,
      installationId: install.id,
      githubRepoId: "601",
      owner: "org-appr",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-appr/app",
    });
    projectA = (
      await createProjectWithRepo(db, {
        workspaceId: wsA,
        name: "Appr App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await createBriefDraft(db, {
      workspaceId: wsA,
      projectId: projectA,
      actor: actorA,
      rawIdea: "Inbox item",
      content: {
        title: "Pending brief",
        targetUser: "Users",
        problem: "P",
        scope: "S",
        nonGoals: "N",
        acceptanceCriteria: ["A"],
        clarifyingAnswers: [],
      },
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("lists pending only for the requested workspace", async () => {
    const forA = await listPendingApprovalsForWorkspace(db, wsA);
    const forB = await listPendingApprovalsForWorkspace(db, wsB);
    assert.ok(forA.some((a) => a.targetType === "brief"));
    assert.equal(forB.length, 0);
    assert.ok(forA.every((a) => a.workspaceId === wsA));
  });
});
