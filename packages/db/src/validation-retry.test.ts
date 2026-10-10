import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  appendRunEvent,
  approveBrief,
  approveTask,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  generateProjectPlan,
  getAgentRun,
  getTaskById,
  insertTestUser,
  listRunEvents,
  markRunFailed,
  retryFailedTask,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
  claimRunById,
  enqueueAgentRun,
} from "./index.js";
import { projects, tasks } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("validation failure + safe retry", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `val-${stamp}`,
      githubUserId: `gh-val-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Val WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-val-${stamp}`,
      accountLogin: "org-val",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "913",
      owner: "org-val",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-val/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Val App",
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
      rawIdea: "val",
      content: {
        title: "V",
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
              title: "Retry task",
              goal: "g",
              scope: "s",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 15_000,
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

  it("retry uses new attempt key and preserves prior run events", async () => {
    const first = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `task:${taskId}:attempt:1`,
    });
    assert.equal(first.created, false);

    const claimed = await claimRunById(db, first.run.id, "retry-w", 30_000);
    assert.ok(claimed);

    await appendRunEvent(db, {
      runId: first.run.id,
      workspaceId,
      kind: "log",
      payload: { message: "prior attempt log — must survive" },
    });

    await markRunFailed(db, {
      runId: first.run.id,
      workerId: "retry-w",
      errorCode: "validation_failed",
      errorMessage: "forced",
    });

    await db
      .update(tasks)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    const priorEvents = await listRunEvents(db, first.run.id);
    assert.ok(priorEvents.some((e) => e.kind === "log"));

    const retried = await retryFailedTask(db, {
      workspaceId,
      taskId,
      actor,
    });
    assert.equal(retried.attempt, 2);
    assert.notEqual(retried.runId, first.run.id);

    const stillThere = await listRunEvents(db, first.run.id);
    assert.equal(stillThere.length, priorEvents.length);

    const newRun = await getAgentRun(db, retried.runId);
    assert.equal(newRun?.status, "QUEUED");
    assert.equal(newRun?.idempotencyKey, `task:${taskId}:attempt:2`);
    assert.equal(newRun?.attempt, 2);

    const task = await getTaskById(db, taskId);
    assert.equal(task?.status, "QUEUED");
    assert.equal(task?.attemptCount, 2);
  });

  it("blocks retry when max_attempts exhausted", async () => {
    await db
      .update(tasks)
      .set({
        status: "FAILED",
        attemptCount: 3,
        maxAttempts: 3,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await assert.rejects(
      () => retryFailedTask(db, { workspaceId, taskId, actor }),
      (err: Error & { code?: string }) =>
        err.name === "TaskTransitionError" && err.code === "policy",
    );
  });
});
