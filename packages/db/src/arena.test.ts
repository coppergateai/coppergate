import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  ArenaError,
  applyContenderDebit,
  assertAtMostOneWinner,
  assertNonNegativeBudget,
  canContenderEnqueue,
  createTournament,
  debitContenderBudget,
  ensureArenaForProject,
  killArena,
  resolveTournamentByFitness,
  selectWinnerByFitness,
} from "./arena.js";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { agentRuns } from "./schema.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

describe("arena invariants (pure)", () => {
  it("rejects negative budgets", () => {
    assert.throws(() => assertNonNegativeBudget(-1), ArenaError);
    assert.throws(() => debitContenderBudget(10, -1), ArenaError);
  });

  it("debits and eliminates at zero", () => {
    assert.deepEqual(debitContenderBudget(100, 40), {
      remainingMicros: 60,
      eliminated: false,
    });
    assert.deepEqual(debitContenderBudget(40, 40), {
      remainingMicros: 0,
      eliminated: true,
    });
    assert.deepEqual(debitContenderBudget(10, 50), {
      remainingMicros: 0,
      eliminated: true,
    });
  });

  it("selects highest fitness with stable tie-break", () => {
    const winner = selectWinnerByFitness([
      { runId: "b", fitnessScore: 0.8 },
      { runId: "a", fitnessScore: 0.9 },
      { runId: "c", fitnessScore: 0.9 },
    ]);
    assert.equal(winner.runId, "a");
  });

  it("rejects unscored tournaments", () => {
    assert.throws(
      () =>
        selectWinnerByFitness([
          { runId: "a", fitnessScore: null },
          { runId: "b", fitnessScore: Number.NaN },
        ]),
      ArenaError,
    );
  });

  it("allows at most one winner", () => {
    assert.throws(
      () => assertAtMostOneWinner(["WINNER", "WINNER", "LOSER"]),
      ArenaError,
    );
    assert.doesNotThrow(() =>
      assertAtMostOneWinner(["WINNER", "LOSER", "LOSER"]),
    );
  });

  it("blocks enqueue when killed, eliminated, or broke", () => {
    assert.equal(
      canContenderEnqueue({
        arenaStatus: "KILLED",
        contenderStatus: "ACTIVE",
        budgetMicrosRemaining: 100,
      }),
      false,
    );
    assert.equal(
      canContenderEnqueue({
        arenaStatus: "RUNNING",
        contenderStatus: "ELIMINATED",
        budgetMicrosRemaining: 100,
      }),
      false,
    );
    assert.equal(
      canContenderEnqueue({
        arenaStatus: "ARMED",
        contenderStatus: "ACTIVE",
        budgetMicrosRemaining: 0,
      }),
      false,
    );
    assert.equal(
      canContenderEnqueue({
        arenaStatus: "ARMED",
        contenderStatus: "ACTIVE",
        budgetMicrosRemaining: 1,
      }),
      true,
    );
  });
});

const url = process.env.DATABASE_URL;

describe("arena persistence", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `arena-${stamp}`,
      githubUserId: `gh-arena-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Arena WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-arena-${stamp}`,
      accountLogin: "org-arena",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "801",
      owner: "org-arena",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-arena/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Arena App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "arena",
      content: {
        title: "A",
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

  it("ensures arena, debits to elimination, resolves tournament, kill-switch", async () => {
    const { arena, contenders, created } = await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: 2,
      contenderBudgetMicros: 100,
    });
    assert.equal(created, true);
    assert.equal(contenders.length, 2);

    const again = await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
    });
    assert.equal(again.created, false);
    assert.equal(again.arena.id, arena.id);

    const broke = await applyContenderDebit(db, {
      workspaceId,
      contenderId: contenders[0]!.id,
      debitMicros: 100,
      actor,
    });
    assert.equal(broke.status, "ELIMINATED");
    assert.equal(broke.budgetMicrosRemaining, 0);
    assert.equal(
      canContenderEnqueue({
        arenaStatus: arena.status,
        contenderStatus: broke.status,
        budgetMicrosRemaining: broke.budgetMicrosRemaining,
      }),
      false,
    );

    const tournament = await createTournament(db, {
      workspaceId,
      projectId,
      arenaId: arena.id,
      taskId,
      n: 2,
      actor,
    });

    const runA = crypto.randomUUID();
    const runB = crypto.randomUUID();
    await db.insert(agentRuns).values([
      {
        id: runA,
        workspaceId,
        projectId,
        taskId,
        status: "VALIDATING",
        idempotencyKey: `t-${tournament.id}-a`,
        tournamentId: tournament.id,
        contenderId: contenders[0]!.id,
        fitnessScore: 0.4,
        spendCapMicros: 0,
        estimatedCostMicros: 0,
        actualCostMicros: 0,
      },
      {
        id: runB,
        workspaceId,
        projectId,
        taskId,
        status: "VALIDATING",
        idempotencyKey: `t-${tournament.id}-b`,
        tournamentId: tournament.id,
        contenderId: contenders[1]!.id,
        fitnessScore: 0.95,
        spendCapMicros: 0,
        estimatedCostMicros: 0,
        actualCostMicros: 0,
      },
    ]);

    const resolved = await resolveTournamentByFitness(db, {
      workspaceId,
      tournamentId: tournament.id,
      actor,
    });
    assert.equal(resolved.winnerRunId, runB);

    const [winnerRow] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runB))
      .limit(1);
    const [loserRow] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runA))
      .limit(1);
    assert.equal(winnerRow?.tournamentResult, "WINNER");
    assert.equal(loserRow?.tournamentResult, "LOSER");

    const killed = await killArena(db, {
      workspaceId,
      arenaId: arena.id,
      actor,
    });
    assert.equal(killed.status, "KILLED");
    assert.ok(killed.killedAt);

    await assert.rejects(
      () =>
        createTournament(db, {
          workspaceId,
          projectId,
          arenaId: arena.id,
          taskId,
          n: 2,
          actor,
        }),
      (err: unknown) => err instanceof ArenaError && err.code === "killed",
    );
  });
});
