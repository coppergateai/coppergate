import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { projects } from "./schema.js";
import {
  approveTask,
  listTaskTransitions,
  submitTaskForApproval,
} from "./task-transitions.js";
import { TaskTransitionError } from "./task-sm.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("task transitions persistence", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let rootTaskId = "";
  let childTaskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `sm-${stamp}`,
      githubUserId: `gh-sm-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "SM WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-sm-${stamp}`,
      accountLogin: "org-sm",
      status: "active",
    });

    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "501",
      owner: "org-sm",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-sm/app",
    });

    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "SM App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "SM idea",
      content: {
        title: "SM",
        targetUser: "Devs",
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
          title: "M1",
          description: "",
          tasks: [
            {
              key: "t1",
              title: "Root",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 10_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
            {
              key: "t2",
              title: "Child",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 10_000,
              estimateComplexity: "S",
              dependsOn: ["t1"],
              priority: 2,
            },
          ],
        },
      ],
    });

    rootTaskId = plan.milestones[0]!.tasks[0]!.task.id;
    childTaskId = plan.milestones[0]!.tasks[1]!.task.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("records actor+timestamp on submit", async () => {
    const { task, transition } = await submitTaskForApproval(db, {
      workspaceId,
      taskId: rootTaskId,
      actor,
    });
    assert.equal(task.status, "READY_FOR_APPROVAL");
    assert.equal(transition.fromStatus, "DRAFT");
    assert.equal(transition.toStatus, "READY_FOR_APPROVAL");
    assert.equal(transition.actor, actor);
    assert.ok(transition.createdAt instanceof Date);

    const history = await listTaskTransitions(db, workspaceId, rootTaskId);
    assert.ok(history.length >= 1);
  });

  it("blocks queue under L0 autonomy", async () => {
    await assert.rejects(
      () =>
        approveTask(db, {
          workspaceId,
          taskId: rootTaskId,
          actor,
        }),
      (err: unknown) =>
        err instanceof TaskTransitionError && err.code === "policy",
    );
  });

  it("queues when policies satisfied", async () => {
    await db
      .update(projects)
      .set({ autonomyLevel: "L1", maxBudgetMicros: 1_000_000 })
      .where(eq(projects.id, projectId));

    const { task } = await approveTask(db, {
      workspaceId,
      taskId: rootTaskId,
      actor,
    });
    assert.equal(task.status, "QUEUED");
  });

  it("blocks child until predecessor DONE", async () => {
    await assert.rejects(
      () =>
        submitTaskForApproval(db, {
          workspaceId,
          taskId: childTaskId,
          actor,
        }),
      (err: unknown) =>
        err instanceof TaskTransitionError &&
        err.code === "policy" &&
        /Predecessor/i.test(err.message),
    );
  });
});
