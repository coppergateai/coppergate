import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import {
  assertSufficientBudget,
  BudgetError,
  getProjectSpendSummary,
  reserveEstimateForTask,
  setProjectBudget,
} from "./budgets.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("project budgets", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `bud-${stamp}`,
      githubUserId: `gh-bud-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Budget WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-bud-${stamp}`,
      accountLogin: "org-bud",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "701",
      owner: "org-bud",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-bud/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Budget App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "budget",
      content: {
        title: "B",
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
              title: "T",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 40_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    taskId = plan.milestones[0]!.tasks[0]!.task.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("blocks enqueue when cap insufficient", async () => {
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 5_000,
      actor,
    });
    await assert.rejects(
      () => assertSufficientBudget(db, workspaceId, projectId, 10_000),
      (err: unknown) =>
        err instanceof BudgetError && err.code === "insufficient",
    );
  });

  it("blocks spend when budget is paused", async () => {
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 100_000,
      status: "paused",
      actor,
    });
    const summary = await getProjectSpendSummary(db, workspaceId, projectId);
    assert.equal(summary.budgetStatus, "paused");
    await assert.rejects(
      () => assertSufficientBudget(db, workspaceId, projectId, 1_000),
      (err: unknown) => err instanceof BudgetError && err.code === "paused",
    );
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 100_000,
      status: "active",
      actor,
    });
  });

  it("reserves estimate and reduces available", async () => {
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 100_000,
      status: "active",
      actor,
    });
    await reserveEstimateForTask(db, {
      workspaceId,
      projectId,
      taskId,
      estimateMicros: 40_000,
    });
    const summary = await getProjectSpendSummary(db, workspaceId, projectId);
    assert.equal(summary.capMicros, 100_000);
    assert.equal(summary.reservedMicros, 40_000);
    assert.equal(summary.availableMicros, 60_000);
    assert.equal(summary.spentMicros, 0);
  });
});
