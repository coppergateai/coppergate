import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import {
  appendUsageEvent,
  assertSufficientBudget,
  BudgetError,
  getProjectSpendSummary,
  getWorkspaceSpendSummary,
  outstandingEstimateReserveForTask,
  releaseEstimateForRun,
  reserveEstimateForTask,
  setProjectBudget,
  setWorkspaceBudget,
} from "./budgets.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

async function seedProject(
  db: ReturnType<typeof createDb>,
  input: {
    workspaceId: string;
    actor: string;
    installationId: string;
    name: string;
    repoName: string;
    githubRepoId: string;
  },
) {
  const conn = await connectRepository(db, {
    workspaceId: input.workspaceId,
    installationId: input.installationId,
    githubRepoId: input.githubRepoId,
    owner: "org-bud",
    name: input.repoName,
    defaultBranch: "main",
    baseRepoFullName: `org-bud/${input.repoName}`,
  });
  const projectId = (
    await createProjectWithRepo(db, {
      workspaceId: input.workspaceId,
      name: input.name,
      mode: "existing_repo",
      repositoryConnectionId: conn.id,
    })
  ).project.id;

  const draft = await createBriefDraft(db, {
    workspaceId: input.workspaceId,
    projectId,
    actor: input.actor,
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
    workspaceId: input.workspaceId,
    projectId,
    briefId: draft.id,
    actor: input.actor,
  });

  const plan = await generateProjectPlan(db, {
    workspaceId: input.workspaceId,
    projectId,
    actor: input.actor,
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
  return {
    projectId,
    taskId: plan.milestones[0]!.tasks[0]!.task.id,
  };
}

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
    const seeded = await seedProject(db, {
      workspaceId,
      actor,
      installationId: install.id,
      name: "Budget App",
      repoName: "app",
      githubRepoId: "701",
    });
    projectId = seeded.projectId;
    taskId = seeded.taskId;
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

  it("releases estimate for a finished run and restores available", async () => {
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
    const runId = crypto.randomUUID();
    await releaseEstimateForRun(db, {
      workspaceId,
      projectId,
      taskId,
      runId,
      amountMicros: 40_000,
    });
    const outstanding = await outstandingEstimateReserveForTask(db, {
      workspaceId,
      projectId,
      taskId,
    });
    assert.equal(outstanding, 0);
    const summary = await getProjectSpendSummary(db, workspaceId, projectId);
    assert.equal(summary.reservedMicros, 0);
    assert.equal(summary.availableMicros, 100_000);
  });
});

describe("workspace pooled budgets", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectA = "";
  let projectB = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `wbud-${stamp}`,
      githubUserId: `gh-wbud-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Pooled Budget WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-wbud-${stamp}`,
      accountLogin: "org-bud",
      status: "active",
    });
    projectA = (
      await seedProject(db, {
        workspaceId,
        actor,
        installationId: install.id,
        name: "Pool A",
        repoName: "pool-a",
        githubRepoId: "801",
      })
    ).projectId;
    projectB = (
      await seedProject(db, {
        workspaceId,
        actor,
        installationId: install.id,
        name: "Pool B",
        repoName: "pool-b",
        githubRepoId: "802",
      })
    ).projectId;

    await setProjectBudget(db, {
      workspaceId,
      projectId: projectA,
      capMicros: 50_000_000,
      actor,
      status: "active",
    });
    await setWorkspaceBudget(db, {
      workspaceId,
      capMicros: 100_000,
      period: "monthly",
      actor,
      status: "active",
      pauseProjectBudgets: true,
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("shares available across projects and blocks when pool exhausted", async () => {
    await appendUsageEvent(db, {
      workspaceId,
      projectId: projectA,
      kind: "llm_tokens",
      costMicros: 60_000,
      quantity: "1",
    });
    await appendUsageEvent(db, {
      workspaceId,
      projectId: projectB,
      kind: "llm_tokens",
      costMicros: 30_000,
      quantity: "1",
    });

    const ws = await getWorkspaceSpendSummary(db, workspaceId);
    assert.ok(ws);
    assert.equal(ws!.capMicros, 100_000);
    assert.equal(ws!.spentMicros, 90_000);
    assert.equal(ws!.availableMicros, 10_000);

    const summaryA = await getProjectSpendSummary(db, workspaceId, projectA);
    const summaryB = await getProjectSpendSummary(db, workspaceId, projectB);
    assert.equal(summaryA.pooled, true);
    assert.equal(summaryB.pooled, true);
    assert.equal(summaryA.availableMicros, 10_000);
    assert.equal(summaryB.availableMicros, 10_000);
    assert.equal(summaryA.projectSpentMicros, 60_000);
    assert.equal(summaryB.projectSpentMicros, 30_000);

    await assert.rejects(
      () => assertSufficientBudget(db, workspaceId, projectB, 20_000),
      (err: unknown) =>
        err instanceof BudgetError && err.code === "insufficient",
    );
    await assertSufficientBudget(db, workspaceId, projectA, 10_000);
  });

  it("dedupes llm_tokens usage once per runId", async () => {
    const runId = crypto.randomUUID();
    const first = await appendUsageEvent(db, {
      workspaceId,
      projectId: projectA,
      runId,
      kind: "llm_tokens",
      costMicros: 1_000,
      quantity: "10",
    });
    const second = await appendUsageEvent(db, {
      workspaceId,
      projectId: projectA,
      runId,
      kind: "llm_tokens",
      costMicros: 99_000,
      quantity: "999",
    });
    assert.equal(second.id, first.id);
    assert.equal(second.costMicros, 1_000);
  });
});
