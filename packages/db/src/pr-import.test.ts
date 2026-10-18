import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./client.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { createProjectWithRepo } from "./projects.js";
import { importGithubPrAsTask, PrImportError } from "./pr-import.js";
import { productBriefs, projects } from "./schema.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("importGithubPrAsTask", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let ownerId = "";
  let workspaceId = "";
  let projectId = "";

  before(async () => {
    const stamp = Date.now();
    const owner = await insertTestUser(db, {
      login: `primp-${stamp}`,
      githubUserId: `gh-primp-${stamp}`,
    });
    ownerId = owner.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: `PR Import ${stamp}`,
        ownerUserId: ownerId,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-pr-${stamp}`,
      accountLogin: "acme",
      status: "active",
    });

    const connection = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: `repo-pr-${stamp}`,
      owner: "acme",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "acme/app",
    });

    const created = await createProjectWithRepo(db, {
      workspaceId,
      name: `Proj ${stamp}`,
      mode: "existing_repo",
      repositoryConnectionId: connection.id,
      stack: "nextjs_ts",
    });
    projectId = created.project.id;

    const now = new Date();
    const briefId = crypto.randomUUID();
    await db.insert(productBriefs).values({
      id: briefId,
      workspaceId,
      projectId,
      revision: 1,
      status: "approved",
      title: "Brief",
      targetUser: "devs",
      problem: "p",
      scope: "s",
      nonGoals: "n",
      acceptanceCriteria: "[]",
      rawIdea: "review open PRs",
      clarifyingAnswers: "[]",
      createdBy: ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .update(projects)
      .set({ currentBriefId: briefId, updatedAt: now })
      .where(eq(projects.id, projectId));
  });

  after(async () => {
    await closeDb(db);
  });

  it("imports a PR and rejects duplicate", async () => {
    const task = await importGithubPrAsTask(db, {
      workspaceId,
      projectId,
      actor: ownerId,
      prNumber: 42,
      title: "Review me",
      body: "Please review",
    });
    assert.equal(task.githubPrNumber, 42);
    assert.equal(task.githubIssueNumber, null);
    assert.match(task.scope, /PR #42/);

    await assert.rejects(
      () =>
        importGithubPrAsTask(db, {
          workspaceId,
          projectId,
          actor: ownerId,
          prNumber: 42,
          title: "Again",
        }),
      (err: unknown) =>
        err instanceof PrImportError && err.code === "conflict",
    );
  });
});
