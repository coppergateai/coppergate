import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  appendRunEvent,
  closeDb,
  createDb,
  createWorkspaceWithOwner,
  enqueueAgentRun,
  getRunCiFitness,
  ingestCiEvidence,
  insertTestUser,
  listRunEvents,
  runHasBlockingCi,
  upsertGithubInstallation,
  connectRepository,
  createProjectWithRepo,
  setProjectBudget,
  createBriefDraft,
  approveBrief,
  generateProjectPlan,
} from "./index.js";
import { agentRuns, projects } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("CI evidence ingestion", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let runId = "";
  let actor = "";
  const headSha = "ciheadsha001";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `ci-${stamp}`,
      githubUserId: `gh-ci-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "CI WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-ci-${stamp}`,
      accountLogin: "org-ci",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "915",
      owner: "org-ci",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-ci/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "CI App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;
    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 1_000_000,
      actor: user.id,
    });
    await db
      .update(projects)
      .set({ autonomyLevel: "L1" })
      .where(eq(projects.id, projectId));
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor: user.id,
      rawIdea: "ci",
      content: {
        title: "C",
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
      actor: user.id,
    });
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor: user.id,
      milestones: [
        {
          title: "M",
          description: "",
          tasks: [
            {
              key: "t1",
              title: "CI task",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const taskId = plan.milestones[0]!.tasks[0]!.task.id;
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `ci-${stamp}`,
    });
    runId = run.id;
    await db
      .update(agentRuns)
      .set({
        headSha,
        status: "REVIEW_REQUIRED",
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, runId));
  });

  after(async () => {
    await closeDb(db);
  });

  it("attaches green checks and leaves accept unblocked", async () => {
    const { attached, run } = await ingestCiEvidence(db, {
      workspaceId,
      headSha,
      name: "build",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 1,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    assert.equal(attached, true);
    assert.equal(run?.id, runId);
    const events = await listRunEvents(db, runId);
    assert.ok(events.some((e) => e.payload.includes("CI build")));
    assert.equal(await runHasBlockingCi(db, runId), false);
  });

  it("failing checks block ACCEPTED auto-path", async () => {
    await ingestCiEvidence(db, {
      workspaceId,
      headSha,
      name: "test",
      status: "completed",
      conclusion: "failure",
      passed: false,
      blocksAccept: true,
      checkRunId: 2,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    assert.equal(await runHasBlockingCi(db, runId), true);
    const [run] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);
    assert.equal(run?.errorCode, "ci_failed");
  });

  it("later green check for same name clears blocker", async () => {
    const stamp = Date.now();
    const sha = `clearedsha${stamp}`;
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M-clear",
          description: "",
          tasks: [
            {
              key: `clear-${stamp}`,
              title: "Clear CI",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const taskId = plan.milestones[0]!.tasks[0]!.task.id;
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `ci-clear-${stamp}`,
    });
    await db
      .update(agentRuns)
      .set({
        headSha: sha,
        status: "REVIEW_REQUIRED",
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    await ingestCiEvidence(db, {
      workspaceId,
      headSha: sha,
      name: "test",
      status: "completed",
      conclusion: "failure",
      passed: false,
      blocksAccept: true,
      checkRunId: 10,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    assert.equal(await runHasBlockingCi(db, run.id), true);

    await ingestCiEvidence(db, {
      workspaceId,
      headSha: sha,
      name: "test",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 11,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    const fitness = await getRunCiFitness(db, run.id);
    assert.equal(fitness.blocking, false);
    assert.equal(fitness.passed, true);
    const [row] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, run.id))
      .limit(1);
    assert.equal(row?.errorCode, null);
  });

  it("WAITING_CI status alone is never accept-ready (even without pending event)", async () => {
    const stamp = Date.now();
    const sha = `waitci${stamp}`;
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M-waitci",
          description: "",
          tasks: [
            {
              key: `waitci-${stamp}`,
              title: "Wait CI status",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const taskId = plan.milestones[0]!.tasks[0]!.task.id;
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `ci-waitci-${stamp}`,
    });
    await db
      .update(agentRuns)
      .set({
        headSha: sha,
        status: "WAITING_CI",
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    const fitness = await getRunCiFitness(db, run.id);
    assert.equal(fitness.awaitingLive, true);
    assert.equal(fitness.ciSatisfied, false);
    assert.equal(fitness.acceptReady, false);
  });

  it("green CI while WAITING_CI promotes to REVIEW_REQUIRED then accept-ready", async () => {
    const stamp = Date.now();
    const sha = `promoteci${stamp}`;
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M-promote",
          description: "",
          tasks: [
            {
              key: `promote-${stamp}`,
              title: "Promote from WAITING_CI",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const taskId = plan.milestones[0]!.tasks[0]!.task.id;
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `ci-promote-${stamp}`,
    });
    await db
      .update(agentRuns)
      .set({
        headSha: sha,
        status: "WAITING_CI",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    const before = await getRunCiFitness(db, run.id);
    assert.equal(before.acceptReady, false);
    assert.equal(before.ciSatisfied, false);

    const { run: afterIngest } = await ingestCiEvidence(db, {
      workspaceId,
      headSha: sha,
      name: "test",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 42,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    assert.equal(afterIngest?.status, "REVIEW_REQUIRED");

    const after = await getRunCiFitness(db, afterIngest!.id);
    assert.equal(after.ciSatisfied, true);
    assert.equal(after.passed, true);
    assert.equal(after.acceptReady, true);
  });

  it("fitness pending without green CI is not accept-ready", async () => {
    const stamp = Date.now();
    const pendingSha = `pendingsha${stamp}`;
    const plan = await generateProjectPlan(db, {
      workspaceId,
      projectId,
      actor,
      milestones: [
        {
          title: "M-pending",
          description: "",
          tasks: [
            {
              key: `pend-${stamp}`,
              title: "Pending CI",
              goal: "g",
              scope: "s",
              allowedPaths: [],
              acceptanceCriteria: ["ok"],
              estimateMicros: 1000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
          ],
        },
      ],
    });
    const taskId = plan.milestones[0]!.tasks[0]!.task.id;
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `ci-pend-${stamp}`,
    });
    await db
      .update(agentRuns)
      .set({
        headSha: pendingSha,
        status: "WAITING_CI",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    const fitness = await getRunCiFitness(db, run.id);
    assert.equal(fitness.awaitingLive, true);
    assert.equal(fitness.ciSatisfied, false);
    assert.equal(fitness.acceptReady, false);

    const { run: afterIngest } = await ingestCiEvidence(db, {
      workspaceId,
      headSha: pendingSha,
      name: "test",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 99,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    assert.ok(afterIngest);
    assert.equal(afterIngest!.status, "REVIEW_REQUIRED");
    const ready = await getRunCiFitness(db, afterIngest!.id);
    assert.equal(ready.passed, true);
    assert.equal(ready.acceptReady, true);
  });

  it("refuses empty workspaceId (fail closed)", async () => {
    const { attached } = await ingestCiEvidence(db, {
      workspaceId: "   ",
      headSha,
      name: "build",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 1001,
      detailsUrl: null,
      repoFullName: "org-ci/app",
    });
    assert.equal(attached, false);
  });

  it("does not cross-attach CI evidence by shared headSha", async () => {
    const stamp = Date.now();
    const sharedSha = `sharedsha${stamp}`;
    const attacker = await insertTestUser(db, {
      login: `ci-atk-${stamp}`,
      githubUserId: `gh-ci-atk-${stamp}`,
    });
    const attackerWs = (
      await createWorkspaceWithOwner(db, {
        name: "Attacker CI WS",
        ownerUserId: attacker.id,
      })
    ).workspace.id;

    await db
      .update(agentRuns)
      .set({ headSha: sharedSha, updatedAt: new Date() })
      .where(eq(agentRuns.id, runId));

    const before = await listRunEvents(db, runId);
    const { attached } = await ingestCiEvidence(db, {
      workspaceId: attackerWs,
      headSha: sharedSha,
      name: "evil",
      status: "completed",
      conclusion: "failure",
      passed: false,
      blocksAccept: true,
      checkRunId: 666,
      detailsUrl: null,
      repoFullName: "evil/repo",
    });
    assert.equal(attached, false);
    const after = await listRunEvents(db, runId);
    assert.equal(after.length, before.length);
    assert.equal(await runHasBlockingCi(db, runId), false);
  });
});
