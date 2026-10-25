import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import {
  ensureArenaForProject,
  killArena,
  listRunsForTournament,
  setArenaMinHuman,
} from "./arena.js";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { upsertWorkspaceSubscription } from "./billing.js";
import { setProjectBudget } from "./budgets.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import { auditEvents, projects, tournaments } from "./schema.js";
import { submitTaskForApproval } from "./task-transitions.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("arena min_human (TASK053)", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let arenaId = "";
  let actor = "";
  let taskOffId = "";
  let taskOnId = "";
  let taskKilledId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `mh-${stamp}`,
      githubUserId: `gh-mh-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "MinHuman WS",
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
      githubInstallationId: `inst-mh-${stamp}`,
      accountLogin: "org-mh",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "902",
      owner: "org-mh",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-mh/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "MinHuman App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await db
      .update(projects)
      .set({ autonomyLevel: "L1", maxBudgetMicros: 2_000_000 })
      .where(eq(projects.id, projectId));

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
      rawIdea: "min_human",
      content: {
        title: "MH",
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
              key: "toff",
              title: "Off",
              goal: "g",
              scope: "s",
              allowedPaths: ["src/**"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 40_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
            {
              key: "ton",
              title: "On",
              goal: "g",
              scope: "s",
              allowedPaths: ["src/**"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 40_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 2,
            },
            {
              key: "tkill",
              title: "Kill",
              goal: "g",
              scope: "s",
              allowedPaths: ["src/**"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 40_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 3,
            },
          ],
        },
      ],
    });
    const tasks = plan.milestones[0]!.tasks;
    taskOffId = tasks[0]!.task.id;
    taskOnId = tasks[1]!.task.id;
    taskKilledId = tasks[2]!.task.id;

    const ensured = await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: 2,
      contenderCount: 2,
      contenderBudgetMicros: 200_000,
    });
    arenaId = ensured.arena.id;
    assert.equal(ensured.arena.minHuman, true);
  });

  after(async () => {
    await closeDb(db);
  });

  it("when min_human off — submit stops at READY_FOR_APPROVAL", async () => {
    await setArenaMinHuman(db, {
      workspaceId,
      arenaId,
      minHuman: false,
      actor,
    });
    const result = await submitTaskForApproval(db, {
      workspaceId,
      taskId: taskOffId,
      actor,
    });
    assert.equal(result.task.status, "READY_FOR_APPROVAL");
    assert.equal(result.autoQueued, undefined);
  });

  it("when min_human on (default) — submit auto-queues and fans out", async () => {
    await setArenaMinHuman(db, {
      workspaceId,
      arenaId,
      minHuman: true,
      actor,
    });

    const result = await submitTaskForApproval(db, {
      workspaceId,
      taskId: taskOnId,
      actor,
    });
    assert.equal(result.autoQueued, true);
    assert.equal(result.task.status, "QUEUED");
    assert.ok(result.task.attemptCount >= 1);

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, workspaceId),
          eq(auditEvents.action, "task.min_human_queue"),
          eq(auditEvents.targetId, taskOnId),
        ),
      )
      .limit(1);
    assert.ok(audit);

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.workspaceId, workspaceId),
          eq(tournaments.taskId, taskOnId),
        ),
      )
      .limit(1);
    assert.ok(tournament);
    const runs = await listRunsForTournament(db, {
      workspaceId,
      tournamentId: tournament.id,
    });
    assert.equal(runs.length, 2);
  });

  it("does not auto-queue when arena is killed", async () => {
    await killArena(db, {
      workspaceId,
      arenaId,
      actor,
    });

    const result = await submitTaskForApproval(db, {
      workspaceId,
      taskId: taskKilledId,
      actor,
    });
    assert.equal(result.task.status, "READY_FOR_APPROVAL");
    assert.equal(result.autoQueued, undefined);
  });
});
