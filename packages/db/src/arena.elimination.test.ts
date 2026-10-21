import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  ArenaError,
  canContenderEnqueue,
  ensureArenaForProject,
  killArena,
  listContendersForArena,
  MAX_TOURNAMENT_FANOUT,
  resumeArena,
  startTournamentFanout,
} from "./arena.js";
import { createArtifact } from "./artifacts.js";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { setProjectBudget } from "./budgets.js";
import { scoreAndResolveTournament } from "./fitness.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { agentRuns } from "./schema.js";
import { applyTaskTransition } from "./task-transitions.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("elimination + kill-switch (TASK051/052)", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `elim-${stamp}`,
      githubUserId: `gh-elim-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Elim WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-elim-${stamp}`,
      accountLogin: "org-elim",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "921",
      owner: "org-elim",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-elim/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Elim App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 2_000_000,
      actor,
    });

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "elim",
      content: {
        title: "E",
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

    // Contender budget = one loss → elimination
    await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: MAX_TOURNAMENT_FANOUT,
      contenderCount: MAX_TOURNAMENT_FANOUT,
      contenderBudgetMicros: 50_000,
    });

    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      toStatus: "READY_FOR_APPROVAL",
      actor,
    });
    await applyTaskTransition(db, {
      workspaceId,
      taskId,
      toStatus: "QUEUED",
      actor,
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("debits losers to elimination and kill-switch freezes then resume", async () => {
    const { arena, tournament, runs } = await startTournamentFanout(db, {
      workspaceId,
      taskId,
      actor,
      n: 2,
    });
    assert.equal(runs.length, 2);

    const [a, b] = runs;
    await createArtifact(db, {
      workspaceId,
      projectId,
      taskId,
      runId: a!.id,
      kind: "validation_report",
      body: { passed: false },
      meta: { passed: false, blocksAccept: true },
    });
    await db
      .update(agentRuns)
      .set({ prUrl: "https://example.com/pr/9", prNumber: 9 })
      .where(eq(agentRuns.id, b!.id));
    await createArtifact(db, {
      workspaceId,
      projectId,
      taskId,
      runId: b!.id,
      kind: "validation_report",
      body: { passed: true },
      meta: { passed: true },
    });
    await createArtifact(db, {
      workspaceId,
      projectId,
      taskId,
      runId: b!.id,
      kind: "diff_summary",
      body: { files: 1 },
    });

    await scoreAndResolveTournament(db, {
      workspaceId,
      tournamentId: tournament.id,
      actor,
    });

    const pool = await listContendersForArena(db, {
      workspaceId,
      arenaId: arena.id,
    });
    const loserContender = pool.find((c) => c.id === a!.contenderId);
    assert.ok(loserContender);
    assert.equal(loserContender.status, "ELIMINATED");
    assert.equal(loserContender.budgetMicrosRemaining, 0);
    assert.equal(
      canContenderEnqueue({
        arenaStatus: "RUNNING",
        contenderStatus: loserContender.status,
        budgetMicrosRemaining: loserContender.budgetMicrosRemaining,
      }),
      false,
    );

    const killed = await killArena(db, {
      workspaceId,
      arenaId: arena.id,
      actor,
    });
    assert.equal(killed.status, "KILLED");

    await assert.rejects(
      () =>
        startTournamentFanout(db, {
          workspaceId,
          taskId,
          actor,
          n: 2,
        }),
      (err: unknown) => err instanceof ArenaError && err.code === "killed",
    );

    const resumed = await resumeArena(db, {
      workspaceId,
      arenaId: arena.id,
      actor,
    });
    assert.equal(resumed.status, "RUNNING");
    assert.equal(resumed.killedAt, null);

    // Only one active contender left → fan-out n=1
    const again = await startTournamentFanout(db, {
      workspaceId,
      taskId,
      actor,
      n: 2,
    });
    // Open tournament from before kill was CANCELLED; new one may create with n=1
    assert.ok(again.runs.length >= 1);
    assert.ok(again.runs.length <= MAX_TOURNAMENT_FANOUT);
    for (const run of again.runs) {
      assert.notEqual(run.contenderId, loserContender.id);
    }
  });
});
