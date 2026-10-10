import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  approveBrief,
  approveTask,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  decideTaskReview,
  generateProjectPlan,
  getTaskById,
  insertTestUser,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
  applyTaskTransition,
} from "./index.js";
import { projects, tasks } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("task review decisions", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `rev-${stamp}`,
      githubUserId: `gh-rev-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Review WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-rev-${stamp}`,
      accountLogin: "org-rev",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "916",
      owner: "org-rev",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-rev/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Review App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 5_000_000,
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
      rawIdea: "review",
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
              title: "Review task",
              goal: "g",
              scope: "s",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 10_000,
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
    // Fast-forward to REVIEW_REQUIRED
    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      actor,
      toStatus: "RUNNING",
      reason: "test",
    });
    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      actor,
      toStatus: "VALIDATING",
      reason: "test",
    });
    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      actor,
      toStatus: "REVIEW_REQUIRED",
      reason: "test",
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("accept moves task to DONE", async () => {
    const result = await decideTaskReview(db, {
      workspaceId,
      taskId,
      actor,
      decision: "accept",
      note: "looks good",
    });
    assert.equal(result.task.status, "DONE");
    const task = await getTaskById(db, taskId);
    assert.equal(task?.status, "DONE");
  });

  it("reject from REVIEW_REQUIRED goes FAILED", async () => {
    // Reset another path: create fresh task
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M2",
          description: "",
          tasks: [
            {
              key: "t2",
              title: "Reject me",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const tid = plan.milestones[0]!.tasks[0]!.task.id;
    await db
      .update(tasks)
      .set({ status: "REVIEW_REQUIRED", updatedAt: new Date() })
      .where(eq(tasks.id, tid));

    const result = await decideTaskReview(db, {
      workspaceId,
      taskId: tid,
      actor,
      decision: "reject",
      note: "wrong approach",
    });
    assert.equal(result.task.status, "FAILED");
  });

  it("request_changes goes NEEDS_REPLAN", async () => {
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M3",
          description: "",
          tasks: [
            {
              key: "t3",
              title: "Changes",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const tid = plan.milestones[0]!.tasks[0]!.task.id;
    await db
      .update(tasks)
      .set({ status: "REVIEW_REQUIRED", updatedAt: new Date() })
      .where(eq(tasks.id, tid));

    const result = await decideTaskReview(db, {
      workspaceId,
      taskId: tid,
      actor,
      decision: "request_changes",
    });
    assert.equal(result.task.status, "NEEDS_REPLAN");
  });
});
