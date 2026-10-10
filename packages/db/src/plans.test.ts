import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  approveBrief,
  createBriefDraft,
} from "./briefs.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import {
  generateProjectPlan,
  getProjectPlan,
  PlanError,
} from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("project plans", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `plan-${stamp}`,
      githubUserId: `gh-plan-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Plan WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-plan-${stamp}`,
      accountLogin: "org-plan",
      status: "active",
    });

    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "401",
      owner: "org-plan",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-plan/app",
    });

    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Plan App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "Waitlist landing",
      content: {
        title: "Waitlist",
        targetUser: "Founders",
        problem: "Need capture",
        scope: "Form + email",
        nonGoals: "Billing",
        acceptanceCriteria: ["User can join"],
        clarifyingAnswers: [],
      },
    });
    await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("rejects cyclic dependency graphs", async () => {
    await assert.rejects(
      () =>
        generateProjectPlan(db, {
          workspaceId,
          projectId,
          actor,
          milestones: [
            {
              title: "Bad",
              description: "",
              tasks: [
                {
                  key: "a",
                  title: "A",
                  goal: "g",
                  scope: "s",
                  allowedPaths: [],
                  acceptanceCriteria: ["x"],
                  estimateMicros: 1,
                  estimateComplexity: "S",
                  dependsOn: ["b"],
                  priority: 1,
                },
                {
                  key: "b",
                  title: "B",
                  goal: "g",
                  scope: "s",
                  allowedPaths: [],
                  acceptanceCriteria: ["x"],
                  estimateMicros: 1,
                  estimateComplexity: "S",
                  dependsOn: ["a"],
                  priority: 2,
                },
              ],
            },
          ],
        }),
      (err: unknown) => err instanceof PlanError && err.code === "cycle",
    );
  });

  it("persists stub plan with deps estimates and criteria", async () => {
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "MVP",
          description: "First slice",
          tasks: [
            {
              key: "t1",
              title: "Scaffold",
              goal: "Baseline",
              scope: "App router + health",
              allowedPaths: ["app/**"],
              acceptanceCriteria: ["Builds"],
              estimateMicros: 50_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 10,
            },
            {
              key: "t2",
              title: "Core flow",
              goal: "Join waitlist",
              scope: "Form + store",
              allowedPaths: ["app/**"],
              acceptanceCriteria: ["User can join"],
              estimateMicros: 150_000,
              estimateComplexity: "M",
              dependsOn: ["t1"],
              priority: 20,
            },
          ],
        },
      ],
    });

    assert.ok(plan.milestones.length >= 1);
    const allTasks = plan.milestones.flatMap((m) => m.tasks);
    assert.equal(allTasks.length, 2);
    for (const { task } of allTasks) {
      assert.ok(task.scope.length > 0);
      assert.ok(task.estimateMicros != null);
      assert.ok(JSON.parse(task.acceptanceCriteria).length > 0);
    }
    assert.equal(plan.dependencies.length, 1);
    assert.ok(
      allTasks.some((t) => t.dependsOnTaskIds.length === 1),
      "successor should list predecessor",
    );

    const loaded = await getProjectPlan(db, workspaceId, projectId);
    assert.ok(loaded);
    assert.equal(loaded!.milestones.length, plan.milestones.length);
  });
});
