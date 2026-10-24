import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  approveBrief,
  closeDb,
  connectRepository,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createTournament,
  createWorkspaceWithOwner,
  enableMaintainerMode,
  enqueueAgentRun,
  generateProjectPlan,
  getArenaForProject,
  getMaintainerMetrics,
  ingestCiEvidence,
  insertTestUser,
  selectAutoAcceptRun,
  setProjectBudget,
  tickMaintainerProject,
  upsertGithubInstallation,
} from "./index.js";
import { agentRuns, projects, tasks } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("maintainer autonomous accept (winner-gated)", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let taskId = "";
  let actor = "";
  const headSha = `maint-${Date.now().toString(16)}`.padEnd(40, "a").slice(0, 40);

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `maint-auto-${stamp}`,
      githubUserId: `gh-maint-auto-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Maint Auto WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-maint-auto-${stamp}`,
      accountLogin: "org-maint",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: String(920_000 + (stamp % 1000)),
      owner: "org-maint",
      name: "kprompt-like",
      defaultBranch: "main",
      baseRepoFullName: "org-maint/kprompt-like",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "kprompt-like",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
        stack: "go",
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
      rawIdea: "autonomous maintainer",
      content: {
        title: "Vision",
        targetUser: "ops",
        problem: "Ship small Go fixes unattended",
        scope: "cmd/ and pkg/",
        nonGoals: "Rewrite",
        acceptanceCriteria: ["CI green", "winner merged"],
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
              key: "ship",
              title: "Ship fix",
              goal: "tiny go fix",
              scope: "one package",
              allowedPaths: ["**/*"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 80_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    taskId = plan.milestones[0]!.tasks[0]!.task.id;

    await enableMaintainerMode(db, {
      workspaceId,
      projectId,
      actor: `system:test`,
      policy: {
        autoMerge: true,
        autoQueueReplanTasks: true,
        selfImprove: false,
        releaseTagStyle: "semver_patch",
      },
    });

    const arena = await getArenaForProject(db, { workspaceId, projectId });
    assert.ok(arena, "arena required after enableMaintainerMode");
    const tournament = await createTournament(db, {
      workspaceId,
      projectId,
      arenaId: arena.id,
      taskId,
      n: 2,
      actor: "system:test",
    });
    const tournamentId = tournament.id;

    const loser = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `loser-${stamp}`,
      tournamentId,
    });
    const winner = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `winner-${stamp}`,
      tournamentId,
    });

    await db
      .update(agentRuns)
      .set({
        status: "REVIEW_REQUIRED",
        tournamentId,
        tournamentResult: "LOSER",
        prNumber: 100,
        prUrl: "https://example.com/pr/100",
        headSha: "b".repeat(40),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, loser.run.id));

    await db
      .update(agentRuns)
      .set({
        status: "REVIEW_REQUIRED",
        tournamentId,
        tournamentResult: "WINNER",
        prNumber: 101,
        prUrl: "https://example.com/pr/101",
        headSha,
        agentProfileKey: "engineer",
        efficiencyScore: 0.8,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, winner.run.id));

    await db
      .update(tasks)
      .set({
        status: "REVIEW_REQUIRED",
        prNumber: 101,
        prUrl: "https://example.com/pr/101",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await ingestCiEvidence(db, {
      workspaceId,
      headSha,
      name: "go-test",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 1,
      detailsUrl: null,
      repoFullName: "org-maint/kprompt-like",
    });

    const selected = selectAutoAcceptRun([
      {
        tournamentId,
        tournamentResult: "LOSER",
      },
      {
        tournamentId,
        tournamentResult: "WINNER",
      },
    ]);
    assert.equal(selected?.tournamentResult, "WINNER");
  });

  after(async () => {
    await closeDb(db);
  });

  it("auto-accepts winner without human Accept", async () => {
    // Keep this tick focused on auto-accept (avoid vision replan side effects).
    await db
      .update(projects)
      .set({ lastVisionReplanAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    const before = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    assert.equal(before[0]?.status, "REVIEW_REQUIRED");

    const tick = await tickMaintainerProject(db, {
      workspaceId,
      projectId,
      actor: "system:maintainer",
    });
    assert.equal(
      tick.errors.length,
      0,
      `tick errors: ${tick.errors.join("; ")}`,
    );
    assert.ok(
      tick.autoAccepted >= 1,
      `expected autoAccepted>=1 got ${tick.autoAccepted}`,
    );

    const after = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    assert.ok(after[0], `task ${taskId} missing after tick`);
    assert.ok(
      after[0]!.status === "ACCEPTED" || after[0]!.status === "DONE",
      `expected ACCEPTED/DONE got ${after[0]!.status}`,
    );

    const metrics = await getMaintainerMetrics(db, {
      workspaceId,
      projectId,
      days: 30,
    });
    assert.ok(metrics.autoAccepts >= 1);
    assert.equal(metrics.maintainerEnabled, true);
  });
});
