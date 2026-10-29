import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  createWorkspaceWithOwner,
  enqueueAgentRun,
  insertTestUser,
  upsertGithubInstallation,
  connectRepository,
  createProjectWithRepo,
  setProjectBudget,
  createBriefDraft,
  approveBrief,
  generateProjectPlan,
  resolveWaitingCiForPrOutcome,
} from "./index.js";
import { agentRuns, tasks } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("WAITING_CI PR outcome recovery", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";
  let stamp = 0;

  before(async () => {
    stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `wci-${stamp}`,
      githubUserId: `gh-wci-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "WCI WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-wci-${stamp}`,
      accountLogin: "org-wci",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "916",
      owner: "org-wci",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-wci/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "WCI App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 1_000_000,
      actor: user.id,
    });
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor: user.id,
      rawIdea: "wci",
      content: {
        title: "W",
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
      actor: user.id,
    });
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor: user.id,
      milestones: [
        {
          title: "M",
          description: "",
          tasks: [
            {
              key: "t1",
              title: "WCI task",
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
    taskId = plan.milestones[0]!.tasks[0]!.task.id;
  });

  after(async () => {
    await closeDb(db);
  });

  async function seedWaitingCi(prNumber: number) {
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `wci-${stamp}-${prNumber}-${Math.random()}`,
    });
    const now = new Date();
    await db
      .update(agentRuns)
      .set({
        status: "WAITING_CI",
        prNumber,
        headSha: `sha-wci-${prNumber}`,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id));
    await db
      .update(tasks)
      .set({ status: "WAITING_CI", updatedAt: now })
      .where(eq(tasks.id, taskId));
    return run.id;
  }

  it("promotes WAITING_CI to REVIEW_REQUIRED when PR is merged", async () => {
    const runId = await seedWaitingCi(101);
    const { run, taskStatus } = await resolveWaitingCiForPrOutcome(db, {
      workspaceId,
      runId,
      outcome: "merged",
      actor,
    });
    assert.equal(run?.status, "REVIEW_REQUIRED");
    assert.equal(taskStatus, "REVIEW_REQUIRED");
  });

  it("fails closed WAITING_CI when PR is closed unmerged", async () => {
    const runId = await seedWaitingCi(102);
    const { run, taskStatus } = await resolveWaitingCiForPrOutcome(db, {
      workspaceId,
      runId,
      outcome: "closed_unmerged",
      actor,
    });
    assert.equal(run?.status, "FAILED");
    assert.equal(run?.errorCode, "pr_closed_before_ci");
    assert.equal(taskStatus, "FAILED");
  });
});
