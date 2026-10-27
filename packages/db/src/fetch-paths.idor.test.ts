import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  approveBrief,
  approveTask,
  closeDb,
  connectRepository,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createTaskRun,
  createWorkspaceWithOwner,
  generateProjectPlan,
  getAgentRunForWorkspace,
  getProjectForWorkspace,
  getTaskById,
  getTaskForWorkspace,
  insertTestUser,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
} from "./index.js";
import { projects } from "./schema.js";

const url = process.env.DATABASE_URL;

/**
 * SEC-021 — workspace-scoped reads on project / task / run fetch paths (IDOR fail-closed).
 */
describe("SEC-021 fetch path IDOR", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let taskId = "";
  let runId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `sec021-${stamp}`,
      githubUserId: `gh-sec021-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "SEC-021 WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    otherWorkspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "SEC-021 Other",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-sec021-${stamp}`,
      accountLogin: "org-sec021",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "sec021",
      owner: "org-sec021",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-sec021/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "SEC-021 App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 10_000_000,
      actor,
    });
    await db
      .update(projects)
      .set({ autonomyLevel: "L1" })
      .where(eq(projects.id, projectId));

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "sec021",
      content: {
        title: "R",
        targetUser: "U",
        problem: "P",
        scope: "S",
        nonGoals: "N",
        acceptanceCriteria: ["A"],
        clarifyingAnswers: [],
      },
    });
    await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });

    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M",
          description: "",
          tasks: [
            {
              key: "t1",
              title: "SEC-021 task",
              goal: "Goal",
              scope: "Scope",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 20_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    taskId = plan.milestones[0]!.tasks[0]!.task.id;
    await submitTaskForApproval(db, { workspaceId, taskId, actor });
    await approveTask(db, { workspaceId, taskId, actor });

    const { run } = await createTaskRun(db, {
      workspaceId,
      taskId,
      idempotencyKey: `sec021-${stamp}`,
      actor,
    });
    runId = run.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("getProjectForWorkspace fails closed across tenants", async () => {
    const mine = await getProjectForWorkspace(db, workspaceId, projectId);
    assert.ok(mine);
    assert.equal(mine.project.workspaceId, workspaceId);

    const leaked = await getProjectForWorkspace(db, otherWorkspaceId, projectId);
    assert.equal(leaked, undefined);
  });

  it("getTaskForWorkspace fails closed across tenants", async () => {
    const byId = await getTaskById(db, taskId);
    assert.ok(byId, "global id lookup exists — APIs must not use this for reads");

    const mine = await getTaskForWorkspace(db, workspaceId, taskId);
    assert.ok(mine);

    const leaked = await getTaskForWorkspace(db, otherWorkspaceId, taskId);
    assert.equal(leaked, undefined);
  });

  it("getAgentRunForWorkspace fails closed across tenants", async () => {
    const mine = await getAgentRunForWorkspace(db, workspaceId, runId);
    assert.ok(mine);

    const leaked = await getAgentRunForWorkspace(db, otherWorkspaceId, runId);
    assert.equal(leaked, undefined);
  });
});
