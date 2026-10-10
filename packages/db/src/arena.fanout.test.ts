import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TOURNAMENT_FANOUT,
  ensureArenaForProject,
  startTournamentFanout,
} from "./arena.js";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { setProjectBudget } from "./budgets.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { applyTaskTransition } from "./task-transitions.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("tournament fan-out (TASK049)", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `fan-${stamp}`,
      githubUserId: `gh-fan-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Fanout WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-fan-${stamp}`,
      accountLogin: "org-fan",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "901",
      owner: "org-fan",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-fan/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Fanout App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 1_000_000,
      actor,
    });

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "fanout",
      content: {
        title: "F",
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
              goal: "shared goal",
              scope: "shared scope",
              allowedPaths: ["src/**"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 50_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    taskId = plan.milestones[0]!.tasks[0]!.task.id;

    await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: MAX_TOURNAMENT_FANOUT,
      contenderCount: MAX_TOURNAMENT_FANOUT,
      contenderBudgetMicros: 200_000,
    });

    // Move task to QUEUED without using approveTask (avoids nested fan-out).
    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      toStatus: "READY_FOR_APPROVAL",
      actor,
      reason: "submit",
    });
    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      toStatus: "QUEUED",
      actor,
      reason: "queue for fanout test",
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("spawns N=2 ContenderRuns with unique branches and shared task context", async () => {
    const first = await startTournamentFanout(db, {
      workspaceId,
      taskId,
      actor,
      n: 2,
    });
    assert.equal(first.created, true);
    assert.equal(first.runs.length, 2);
    assert.equal(first.tournament.n, 2);
    assert.ok(first.tournament.n <= MAX_TOURNAMENT_FANOUT);

    const branches = new Set(first.runs.map((r) => r.branchName));
    assert.equal(branches.size, 2);
    for (const run of first.runs) {
      assert.equal(run.taskId, taskId);
      assert.equal(run.tournamentId, first.tournament.id);
      assert.ok(run.contenderId);
      assert.ok(run.branchName?.startsWith("cg/t/"));
      assert.equal(run.status, "QUEUED");
      assert.equal(run.toolAllowlist, JSON.stringify(["src/**"]));
    }

    const contenderIds = new Set(first.runs.map((r) => r.contenderId));
    assert.equal(contenderIds.size, 2);

    const second = await startTournamentFanout(db, {
      workspaceId,
      taskId,
      actor,
      n: 2,
    });
    assert.equal(second.created, false);
    assert.equal(second.tournament.id, first.tournament.id);
    assert.equal(second.runs.length, 2);
  });
});
