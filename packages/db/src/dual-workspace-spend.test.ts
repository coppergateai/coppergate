import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import {
  appendUsageEvent,
  BudgetError,
  getWorkspaceSpendSummary,
  reserveEstimateForTask,
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
    owner: "org-dual",
    name: input.repoName,
    defaultBranch: "main",
    baseRepoFullName: `org-dual/${input.repoName}`,
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
    rawIdea: "dual ws",
    content: {
      title: "D",
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
            title: "AG-024: reserve scope",
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

describe("AG-024 dual-workspace spend isolation", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let actor = "";
  let coppergateWs = "";
  let kpromptWs = "";
  let cgProjectId = "";
  let kpProjectId = "";
  let cgTaskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `dual-${stamp}`,
      githubUserId: `gh-dual-${stamp}`,
    });
    actor = user.id;
    coppergateWs = (
      await createWorkspaceWithOwner(db, {
        name: "Coppergate pilot",
        ownerUserId: user.id,
      })
    ).workspace.id;
    kpromptWs = (
      await createWorkspaceWithOwner(db, {
        name: "Kprompt dogfood",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const installCg = await upsertGithubInstallation(db, {
      workspaceId: coppergateWs,
      githubInstallationId: `inst-cg-${stamp}`,
      accountLogin: "org-dual",
      status: "active",
    });
    const installKp = await upsertGithubInstallation(db, {
      workspaceId: kpromptWs,
      githubInstallationId: `inst-kp-${stamp}`,
      accountLogin: "org-dual",
      status: "active",
    });

    const cg = await seedProject(db, {
      workspaceId: coppergateWs,
      actor,
      installationId: installCg.id,
      name: "coppergate",
      repoName: "coppergate",
      githubRepoId: "901",
    });
    cgProjectId = cg.projectId;
    cgTaskId = cg.taskId;

    const kp = await seedProject(db, {
      workspaceId: kpromptWs,
      actor,
      installationId: installKp.id,
      name: "kprompt",
      repoName: "kprompt",
      githubRepoId: "902",
    });
    kpProjectId = kp.projectId;

    await setWorkspaceBudget(db, {
      workspaceId: coppergateWs,
      capMicros: 8_000_000,
      period: "monthly",
      actor,
      status: "active",
    });
    await setWorkspaceBudget(db, {
      workspaceId: kpromptWs,
      capMicros: 100_000_000,
      period: "monthly",
      actor,
      status: "active",
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("reserves debit only the owning workspace envelope", async () => {
    const beforeCg = await getWorkspaceSpendSummary(db, coppergateWs);
    const beforeKp = await getWorkspaceSpendSummary(db, kpromptWs);
    assert.ok(beforeCg && beforeKp);
    assert.equal(beforeCg!.availableMicros, 8_000_000);
    assert.equal(beforeKp!.availableMicros, 100_000_000);

    await reserveEstimateForTask(db, {
      workspaceId: coppergateWs,
      projectId: cgProjectId,
      taskId: cgTaskId,
      estimateMicros: 500_000,
    });

    const afterCg = await getWorkspaceSpendSummary(db, coppergateWs);
    const afterKp = await getWorkspaceSpendSummary(db, kpromptWs);
    assert.equal(afterCg!.reservedMicros, 500_000);
    assert.equal(afterCg!.availableMicros, 7_500_000);
    assert.equal(afterKp!.reservedMicros, 0);
    assert.equal(afterKp!.availableMicros, 100_000_000);
  });

  it("rejects reserve when workspaceId does not match project tenant", async () => {
    await assert.rejects(
      () =>
        reserveEstimateForTask(db, {
          workspaceId: kpromptWs,
          projectId: cgProjectId,
          taskId: cgTaskId,
          estimateMicros: 1_000,
        }),
      (err: unknown) =>
        err instanceof BudgetError && err.code === "mismatch",
    );
  });

  it("rejects ledger append that would cross-debit another envelope", async () => {
    await assert.rejects(
      () =>
        appendUsageEvent(db, {
          workspaceId: kpromptWs,
          projectId: cgProjectId,
          kind: "llm_tokens",
          costMicros: 1_000,
          quantity: "1",
        }),
      (err: unknown) =>
        err instanceof BudgetError && err.code === "mismatch",
    );
  });

  it("rejects empty workspaceId on reserve", async () => {
    await assert.rejects(
      () =>
        reserveEstimateForTask(db, {
          workspaceId: "  ",
          projectId: kpProjectId,
          taskId: cgTaskId,
          estimateMicros: 1_000,
        }),
      (err: unknown) =>
        err instanceof BudgetError && err.code === "invalid",
    );
  });
});
