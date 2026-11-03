import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  approveBrief,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createTournament,
  createWorkspaceWithOwner,
  connectRepository,
  decideTaskReview,
  enableMaintainerMode,
  enqueueAgentRun,
  generateProjectPlan,
  getArenaForProject,
  getTaskById,
  insertTestUser,
  setProjectBudget,
  TaskTransitionError,
  upsertGithubInstallation,
} from "./index.js";
import { agentRuns, projects, tasks } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("task review decisions", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `rev-${stamp}`,
      githubUserId: `gh-rev-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Review WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-rev-${stamp}`,
      accountLogin: "org-rev",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "916",
      owner: "org-rev",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-rev/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Review App",
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
    await db
      .update(projects)
      .set({ autonomyLevel: "L1" })
      .where(eq(projects.id, projectId));
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "review",
      content: {
        title: "R",
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
  });

  after(async () => {
    await closeDb(db);
  });

  async function seedReviewTask(key: string): Promise<string> {
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: `M-${key}`,
          description: "",
          tasks: [
            {
              key,
              title: `Review ${key}`,
              goal: "g",
              scope: "s",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["ok"],
              estimateMicros: 10_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const taskId = plan.milestones[0]!.tasks[0]!.task.id;
    // Force REVIEW_REQUIRED without approve→enqueue (approve creates a run).
    await db
      .update(tasks)
      .set({ status: "REVIEW_REQUIRED", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    return taskId;
  }

  async function attachAcceptableRun(
    taskId: string,
    opts?: {
      idempotencyKey?: string;
      tournamentId?: string | null;
      tournamentResult?: string | null;
      status?: string;
      prNumber?: number;
      createdAtOffsetMs?: number;
    },
  ) {
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey:
        opts?.idempotencyKey ?? `rev-run-${taskId}-${Date.now()}-${Math.random()}`,
      tournamentId: opts?.tournamentId ?? null,
    });
    const createdAt =
      opts?.createdAtOffsetMs != null
        ? new Date(Date.now() + opts.createdAtOffsetMs)
        : undefined;
    await db
      .update(agentRuns)
      .set({
        status: opts?.status ?? "REVIEW_REQUIRED",
        tournamentId: opts?.tournamentId ?? null,
        tournamentResult: opts?.tournamentResult ?? null,
        prNumber: opts?.prNumber ?? 42,
        prUrl: `https://example.com/pr/${opts?.prNumber ?? 42}`,
        headSha: "a".repeat(40),
        leaseOwner: null,
        leaseUntil: null,
        ...(createdAt ? { createdAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
    return run.id;
  }

  it("F1: accept without an agent run fails closed", async () => {
    const taskId = await seedReviewTask(`t-norun-${Date.now()}`);
    await assert.rejects(
      () =>
        decideTaskReview(db, {
          workspaceId,
          taskId,
          actor,
          decision: "accept",
        }),
      (err: unknown) => {
        assert.ok(err instanceof TaskTransitionError);
        assert.equal(err.code, "policy");
        assert.match(err.message, /no agent run/i);
        return true;
      },
    );
    const task = await getTaskById(db, taskId);
    assert.equal(task?.status, "REVIEW_REQUIRED");
  });

  it("accept with eligible run moves task to DONE", async () => {
    const taskId = await seedReviewTask(`t-ok-${Date.now()}`);
    await attachAcceptableRun(taskId);
    const result = await decideTaskReview(db, {
      workspaceId,
      taskId,
      actor,
      decision: "accept",
      note: "looks good",
    });
    assert.equal(result.task.status, "DONE");
    const task = await getTaskById(db, taskId);
    assert.equal(task?.status, "DONE");
  });

  it("F13: accept uses WINNER even when a later peer is WAITING_CI", async () => {
    const taskId = await seedReviewTask(`t-win-${Date.now()}`);
    // tournamentResult WINNER is enough for selection; later WAITING_CI must not win by createdAt.
    await attachAcceptableRun(taskId, {
      idempotencyKey: `winner-${taskId}`,
      tournamentResult: "WINNER",
      status: "REVIEW_REQUIRED",
      prNumber: 101,
      createdAtOffsetMs: -60_000,
    });
    await attachAcceptableRun(taskId, {
      idempotencyKey: `later-${taskId}`,
      tournamentResult: null,
      status: "WAITING_CI",
      prNumber: 102,
      createdAtOffsetMs: 0,
    });

    const result = await decideTaskReview(db, {
      workspaceId,
      taskId,
      actor,
      decision: "accept",
      note: "winner green",
    });
    assert.equal(result.task.status, "DONE");
  });

  it("F13: competing tournament without WINNER cannot accept", async () => {
    const taskId = await seedReviewTask(`t-nowin-${Date.now()}`);
    await enableMaintainerMode(db, {
      workspaceId,
      projectId,
      actor,
      policy: { autoMerge: false, autoQueueReplanTasks: false, selfImprove: false },
    });
    const arena = await getArenaForProject(db, { workspaceId, projectId });
    assert.ok(arena);
    const tournament = await createTournament(db, {
      workspaceId,
      projectId,
      arenaId: arena.id,
      taskId,
      n: 2,
      actor,
    });
    await attachAcceptableRun(taskId, {
      idempotencyKey: `a-${taskId}`,
      tournamentId: tournament.id,
      tournamentResult: "LOSER",
      status: "REVIEW_REQUIRED",
      prNumber: 201,
    });
    await attachAcceptableRun(taskId, {
      idempotencyKey: `b-${taskId}`,
      tournamentId: tournament.id,
      tournamentResult: null,
      status: "REVIEW_REQUIRED",
      prNumber: 202,
    });

    await assert.rejects(
      () =>
        decideTaskReview(db, {
          workspaceId,
          taskId,
          actor,
          decision: "accept",
        }),
      (err: unknown) => {
        assert.ok(err instanceof TaskTransitionError);
        assert.equal(err.code, "policy");
        assert.match(err.message, /WINNER/i);
        return true;
      },
    );
  });

  it("reject from REVIEW_REQUIRED goes FAILED", async () => {
    const tid = await seedReviewTask(`t-rej-${Date.now()}`);
    const result = await decideTaskReview(db, {
      workspaceId,
      taskId: tid,
      actor,
      decision: "reject",
      note: "wrong approach",
    });
    assert.equal(result.task.status, "FAILED");
  });

  it("request_changes goes NEEDS_REPLAN", async () => {
    const tid = await seedReviewTask(`t-chg-${Date.now()}`);
    const result = await decideTaskReview(db, {
      workspaceId,
      taskId: tid,
      actor,
      decision: "request_changes",
    });
    assert.equal(result.task.status, "NEEDS_REPLAN");
  });
});
