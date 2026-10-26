import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENDER_STRATEGIES,
  DEFAULT_PAYOFF_ALPHA,
  MIN_DUEL_CONTENDERS,
  ensureArenaForProject,
  ensureDuelContenderPool,
  isTournamentScoreReadyStatus,
  listContendersForArena,
  startTournamentFanout,
} from "./arena.js";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { upsertWorkspaceSubscription } from "./billing.js";
import { setProjectBudget } from "./budgets.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { contenders } from "./schema.js";
import { applyTaskTransition } from "./task-transitions.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";
import { eq } from "drizzle-orm";

describe("tournament score-ready statuses", () => {
  it("excludes WAITING_CI so scoring waits for CI promote", () => {
    assert.equal(isTournamentScoreReadyStatus("WAITING_CI"), false);
    assert.equal(isTournamentScoreReadyStatus("REVIEW_REQUIRED"), true);
    assert.equal(isTournamentScoreReadyStatus("FAILED"), true);
    assert.equal(isTournamentScoreReadyStatus("CANCELLED"), true);
    assert.equal(isTournamentScoreReadyStatus("RUNNING"), false);
  });

  it("keeps DEFAULT_PAYOFF_ALPHA at 0.25", () => {
    assert.equal(DEFAULT_PAYOFF_ALPHA, 0.25);
  });
});

const url = process.env.DATABASE_URL;

describe("community duel arena (N=2)", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `duel-${stamp}`,
      githubUserId: `gh-duel-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Duel WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    // Community — no team upgrade; plan policy must allow duel fan-out.
    await upsertWorkspaceSubscription(db, {
      workspaceId,
      plan: "community",
      status: "active",
    });

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-duel-${stamp}`,
      accountLogin: "org-duel",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: `duel-${stamp}`,
      owner: "org-duel",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-duel/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Duel App",
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

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "duel",
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
      reason: "queue for duel",
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("seeds ≥2 ACTIVE contenders with distinct strategies", async () => {
    const { arena, contenders: pool, created } = await ensureArenaForProject(
      db,
      {
        workspaceId,
        projectId,
        actor,
        defaultContenderN: MIN_DUEL_CONTENDERS,
        contenderBudgetMicros: 200_000,
      },
    );
    assert.equal(created, true);
    assert.equal(arena.payoffAlpha, DEFAULT_PAYOFF_ALPHA);
    assert.ok(pool.length >= MIN_DUEL_CONTENDERS);
    const active = pool.filter((c) => c.status === "ACTIVE");
    assert.ok(active.length >= MIN_DUEL_CONTENDERS);
    assert.notEqual(active[0]!.strategy, active[1]!.strategy);
    assert.ok(
      CONTENDER_STRATEGIES.includes(
        active[0]!.strategy as (typeof CONTENDER_STRATEGIES)[number],
      ),
    );
  });

  it("tops up a thin pool and diversifies colliding strategies", async () => {
    const { arena } = await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
    });
    // Collapse to a single ACTIVE contender with a forced strategy collision setup.
    const pool = await listContendersForArena(db, {
      workspaceId,
      arenaId: arena.id,
    });
    for (const c of pool.slice(1)) {
      await db
        .update(contenders)
        .set({ status: "ELIMINATED", budgetMicrosRemaining: 0 })
        .where(eq(contenders.id, c.id));
    }
    const [sole] = pool;
    assert.ok(sole);
    await db
      .update(contenders)
      .set({ strategy: "balanced", status: "ACTIVE", budgetMicrosRemaining: 200_000 })
      .where(eq(contenders.id, sole.id));

    const topped = await ensureDuelContenderPool(db, {
      workspaceId,
      arenaId: arena.id,
      budgetMicros: 200_000,
    });
    const active = topped.filter((c) => c.status === "ACTIVE");
    assert.ok(active.length >= MIN_DUEL_CONTENDERS);
    assert.notEqual(active[0]!.strategy, active[1]!.strategy);
  });

  it("Community fan-out spawns N=2 ContenderRuns", async () => {
    const result = await startTournamentFanout(db, {
      workspaceId,
      taskId,
      actor,
      n: 11,
    });
    assert.equal(result.created, true);
    assert.equal(result.runs.length, 2);
    assert.equal(result.tournament.n, 2);
    const branches = new Set(result.runs.map((r) => r.branchName));
    assert.equal(branches.size, 2);
  });
});
