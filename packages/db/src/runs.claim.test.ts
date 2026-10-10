import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { approveBrief, createBriefDraft } from "./briefs.js";
import { setProjectBudget } from "./budgets.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { generateProjectPlan } from "./plans.js";
import { createProjectWithRepo } from "./projects.js";
import {
  claimRunById,
  enqueueAgentRun,
  getAgentRun,
  reapStaleRuns,
  releaseRunClaim,
  renewRunLease,
} from "./runs.js";
import { agentRuns } from "./schema.js";
import { eq } from "drizzle-orm";
import {
  approveTask,
  submitTaskForApproval,
} from "./task-transitions.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("agent run claim/lease", { skip: !url }, () => {
  const db = createDb(url!, { max: 8 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `run-${stamp}`,
      githubUserId: `gh-run-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Run WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-run-${stamp}`,
      accountLogin: "org-run",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "801",
      owner: "org-run",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-run/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Run App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 10_000_000,
      actor,
    });

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "run",
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
              title: "Root",
              goal: "g",
              scope: "s",
              allowedPaths: [],
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
    taskId = plan.milestones[0]!.tasks[0]!.task.id;

    // L1 so approve→queue works
    const { projects } = await import("./schema.js");
    await db
      .update(projects)
      .set({ autonomyLevel: "L1" })
      .where(eq(projects.id, projectId));
  });

  after(async () => {
    await closeDb(db);
  });

  it("concurrent workers cannot double-claim the same run", async () => {
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `claim-test-${Date.now()}`,
      estimatedCostMicros: 10_000,
    });
    assert.equal(run.status, "QUEUED");

    const workers = Array.from({ length: 12 }, (_, i) => `worker-${i}`);
    const results = await Promise.all(
      workers.map((w) => claimRunById(db, run.id, w, 5_000)),
    );

    const claimed = results.filter((r) => r !== null);
    assert.equal(claimed.length, 1, "exactly one worker should win");
    assert.equal(claimed[0]!.id, run.id);
    assert.equal(claimed[0]!.status, "RUNNING");
    assert.ok(claimed[0]!.leaseOwner);

    // Others must see empty claims for this single job
    const leftovers = results.filter((r) => r === null);
    assert.equal(leftovers.length, workers.length - 1);
  });

  it("renews lease for owner and reaps stale runs", async () => {
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `reap-test-${Date.now()}`,
    });
    const claimed = await claimRunById(db, run.id, "reaper-worker", 1);
    assert.ok(claimed);
    assert.equal(claimed!.id, run.id);

    await renewRunLease(db, claimed!.id, "reaper-worker", 60_000);
    const renewed = await getAgentRun(db, claimed!.id);
    assert.ok(renewed?.leaseUntil);
    assert.ok(renewed!.leaseUntil!.getTime() > Date.now());

    // Force lease expiry
    await db
      .update(agentRuns)
      .set({ leaseUntil: new Date(Date.now() - 1_000) })
      .where(eq(agentRuns.id, claimed!.id));

    const reaped = await reapStaleRuns(db);
    assert.ok(reaped >= 1);
    const after = await getAgentRun(db, claimed!.id);
    assert.equal(after?.status, "QUEUED");
    assert.equal(after?.leaseOwner, null);
  });

  it("approveTask enqueues a run", async () => {
    // Fresh task without prior enqueue from this path
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M2",
          description: "",
          tasks: [
            {
              key: "tx",
              title: "Enqueue via approve",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 5_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const tid = plan.milestones[0]!.tasks[0]!.task.id;
    await submitTaskForApproval(db, {
      workspaceId,
      taskId: tid,
      actor,
    });
    await approveTask(db, { workspaceId, taskId: tid, actor });

    const { run, created } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId: tid,
      idempotencyKey: `task:${tid}:attempt:1`,
    });
    assert.equal(created, false, "already enqueued by approveTask");
    assert.ok(["QUEUED", "RUNNING"].includes(run.status));
  });

  it("releaseRunClaim returns job to queue", async () => {
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "Release M",
          description: "",
          tasks: [
            {
              key: "tr",
              title: "Release task",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const tid = plan.milestones[0]!.tasks[0]!.task.id;
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId: tid,
      idempotencyKey: `release-${Date.now()}`,
    });
    const claimed = await claimRunById(db, run.id, "release-w", 30_000);
    assert.ok(claimed);
    assert.equal(claimed!.id, run.id);
    const released = await releaseRunClaim(db, claimed!.id, "release-w");
    assert.equal(released.status, "QUEUED");
  });
});
