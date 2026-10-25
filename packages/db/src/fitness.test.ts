import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ensureArenaForProject,
  MAX_TOURNAMENT_FANOUT,
  startTournamentFanout,
} from "./arena.js";
import { createArtifact } from "./artifacts.js";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { upsertWorkspaceSubscription } from "./billing.js";
import { setProjectBudget } from "./budgets.js";
import {
  scoreAndResolveTournament,
  scoreWithRulesCritic,
} from "./fitness.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { agentRuns } from "./schema.js";
import { applyTaskTransition } from "./task-transitions.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";
import { eq } from "drizzle-orm";

describe("rules critic (pure)", () => {
  it("ranks CI+validation+PR above failure", () => {
    const good = scoreWithRulesCritic({
      ciPassed: true,
      validationPassed: true,
      hasPr: true,
      hasDiffEvidence: true,
      blockingFailure: false,
      sonarPassed: true,
      meaningfulDiff: true,
      testsTouched: true,
    });
    const bad = scoreWithRulesCritic({
      ciPassed: false,
      validationPassed: false,
      hasPr: false,
      hasDiffEvidence: false,
      blockingFailure: true,
      sonarPassed: false,
    });
    assert.ok(good.score > bad.score);
    assert.ok(good.score <= 1);
    assert.ok(bad.score >= 0);
    assert.ok(good.breakdown.sonar >= 0);
    assert.equal(bad.breakdown.sonar, 0);
    assert.ok("coverage" in good.breakdown);
    assert.ok("e2e" in good.breakdown);
    assert.ok("meaningful" in good.breakdown);
  });

  it("disqualifies stub/toy deliveries", () => {
    const toy = scoreWithRulesCritic({
      ciPassed: true,
      validationPassed: true,
      hasPr: true,
      hasDiffEvidence: true,
      blockingFailure: false,
      stubOrToy: true,
    });
    assert.equal(toy.score, 0);
    assert.ok(toy.reasons.includes("stub_or_toy_disqualified"));
  });
});

const url = process.env.DATABASE_URL;

describe("scoreAndResolveTournament", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `fit-${stamp}`,
      githubUserId: `gh-fit-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Fitness WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    await upsertWorkspaceSubscription(db, {
      workspaceId,
      plan: "team",
      status: "active",
    });

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-fit-${stamp}`,
      accountLogin: "org-fit",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "911",
      owner: "org-fit",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-fit/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Fitness App",
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
      rawIdea: "fitness",
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
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 20_000,
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
      contenderBudgetMicros: 100_000,
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

  it("higher-fitness contender wins and fitness_report is attached", async () => {
    const { tournament, runs } = await startTournamentFanout(db, {
      workspaceId,
      taskId,
      actor,
      n: 2,
    });
    assert.equal(runs.length, 2);

    const [weak, strong] = runs;

    await createArtifact(db, {
      workspaceId,
      projectId,
      taskId,
      runId: weak!.id,
      kind: "validation_report",
      body: { passed: false, source: "fixture" },
      meta: { passed: false, blocksAccept: true, summary: "fail" },
    });

    await db
      .update(agentRuns)
      .set({ prUrl: "https://example.com/pr/1", prNumber: 1 })
      .where(eq(agentRuns.id, strong!.id));

    await createArtifact(db, {
      workspaceId,
      projectId,
      taskId,
      runId: strong!.id,
      kind: "validation_report",
      body: { passed: true, source: "fixture" },
      meta: { passed: true, summary: "ok" },
    });
    await createArtifact(db, {
      workspaceId,
      projectId,
      taskId,
      runId: strong!.id,
      kind: "diff_summary",
      body: { files: 3 },
      meta: { summary: "diff" },
    });

    const resolved = await scoreAndResolveTournament(db, {
      workspaceId,
      tournamentId: tournament.id,
      actor,
    });

    assert.equal(resolved.winnerRunId, strong!.id);
    const strongScore = resolved.scores.find((s) => s.runId === strong!.id);
    const weakScore = resolved.scores.find((s) => s.runId === weak!.id);
    assert.ok(strongScore && weakScore);
    assert.ok(strongScore.score > weakScore.score);

    const [winner] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, strong!.id))
      .limit(1);
    assert.equal(winner?.tournamentResult, "WINNER");
    assert.ok(winner?.fitnessEvidenceRef);
    assert.ok((winner?.fitnessScore ?? 0) > 0);
  });
});
