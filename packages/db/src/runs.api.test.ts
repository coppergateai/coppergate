import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  approveBrief,
  approveTask,
  claimRunById,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createTaskRun,
  createWorkspaceWithOwner,
  connectRepository,
  generateProjectPlan,
  getAgentRunForWorkspace,
  insertTestUser,
  listRunEventsForWorkspace,
  requestCancelRun,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
} from "./index.js";
import { projects } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("run APIs (create/cancel/events)", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `runapi-${stamp}`,
      githubUserId: `gh-runapi-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Run API WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    otherWorkspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Other WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-runapi-${stamp}`,
      accountLogin: "org-runapi",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "912",
      owner: "org-runapi",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-runapi/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Run API App",
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
      rawIdea: "run api",
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
              title: "Run API task",
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
  });

  after(async () => {
    await closeDb(db);
  });

  it("idempotency key suppresses duplicate runs", async () => {
    const key = `task:${taskId}:attempt:1`;
    const first = await createTaskRun(db, {
      workspaceId,
      taskId,
      idempotencyKey: key,
      actor,
    });
    assert.equal(first.created, false, "approve already enqueued this key");

    const second = await createTaskRun(db, {
      workspaceId,
      taskId,
      idempotencyKey: key,
      actor,
    });
    assert.equal(second.created, false);
    assert.equal(second.run.id, first.run.id);
  });

  it("cancel QUEUED run marks CANCELLED and blocks claim", async () => {
    const { run, created } = await createTaskRun(db, {
      workspaceId,
      taskId,
      idempotencyKey: `cancel-queued-${Date.now()}`,
      actor,
    });
    assert.equal(created, true);
    assert.equal(run.status, "QUEUED");

    const cancelled = await requestCancelRun(db, {
      workspaceId,
      runId: run.id,
      actor,
    });
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.cancelRequestedAt);

    const claimed = await claimRunById(db, run.id, "w-cancel", 30_000);
    assert.equal(claimed, null);
  });

  it("events and get are workspace-scoped (IDOR)", async () => {
    const { run } = await createTaskRun(db, {
      workspaceId,
      taskId,
      idempotencyKey: `idor-${Date.now()}`,
      actor,
    });

    const mine = await getAgentRunForWorkspace(db, workspaceId, run.id);
    assert.ok(mine);
    const other = await getAgentRunForWorkspace(db, otherWorkspaceId, run.id);
    assert.equal(other, undefined);

    await assert.rejects(
      () => listRunEventsForWorkspace(db, otherWorkspaceId, run.id),
      (err: Error & { code?: string }) => err.code === "not_found",
    );
  });
});
