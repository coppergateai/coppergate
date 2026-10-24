import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "@coppergate/telemetry";
import { FakeCodingAgent } from "@coppergate/agents";
import {
  approveBrief,
  approveTask,
  claimRunById,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  ensureArenaForProject,
  ensureDefaultAutoArmRule,
  enqueueAgentRun,
  getAgentRun,
  getTaskById,
  ingestCiEvidence,
  ingestSignal,
  insertTestUser,
  listArtifactsForRun,
  listRunsForTask,
  setProjectBudget,
  upsertGithubInstallation,
} from "@coppergate/db";
import { eq } from "drizzle-orm";
import { projects } from "@coppergate/db";
import { executeClaimedRun } from "./execute.js";

/**
 * D14 wedge depth: Sentry → auto-arm → FakeAgent → PR → CI fitness.
 * Complements Sonar/CI-fail closed-loop without adding adapter breadth.
 */
const url = process.env.DATABASE_URL;

describe("e2e sentry wedge (D14)", { skip: !url }, () => {
  let db: ReturnType<typeof createDb>;

  before(() => {
    db = createDb(url!, { max: 2 });
  });

  after(async () => {
    await closeDb(db);
  });

  it("Sentry high-severity signal arms a reviewable PR", async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `sentry-e2e-${stamp}`,
      githubUserId: `gh-sentry-e2e-${stamp}`,
    });
    const workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Sentry Wedge",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-sentry-${stamp}`,
      accountLogin: "org-sentry",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: `${stamp}`,
      owner: "org-sentry",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-sentry/app",
    });
    const projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Sentry App",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
      })
    ).project.id;

    await setProjectBudget(db, {
      workspaceId,
      projectId,
      capMicros: 10_000_000,
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
      rawIdea: "Fix production errors",
      content: {
        title: "Sentry loop",
        targetUser: "Engineer",
        problem: "Runtime errors need PRs",
        scope: "Sentry arm path",
        nonGoals: "L3 deploy",
        acceptanceCriteria: ["Sentry arms a reviewable PR"],
        clarifyingAnswers: [],
      },
    });
    await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor: user.id,
    });

    await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor: user.id,
      minHuman: false,
      defaultContenderN: 1,
      contenderCount: 1,
      contenderBudgetMicros: 200_000,
    });

    await ensureDefaultAutoArmRule(db, {
      workspaceId,
      provider: "sentry",
      actor: user.id,
      profileKeys: ["fixer"],
    });

    const ingested = await ingestSignal(db, {
      workspaceId,
      projectId,
      actor: user.id,
      envelope: {
        provider: "sentry",
        externalId: `sentry-issue-${stamp}`,
        fingerprint: `sentry:err-${stamp}`,
        severity: "high",
        title: "TypeError: Cannot read property x",
        body: "stack at app/page.tsx:12",
        repoHint: "org-sentry/app",
        urls: ["https://sentry.io/issues/1"],
        labels: ["sentry"],
        rawRef: JSON.stringify({ kind: "test", id: stamp }),
      },
    });

    assert.equal(ingested.duplicate, false);
    assert.equal(ingested.armed, true);
    assert.ok(ingested.task);

    const taskId = ingested.task!.id;
    let task = await getTaskById(db, taskId);
    assert.ok(task);
    if (task.status === "READY_FOR_APPROVAL") {
      await approveTask(db, {
        workspaceId,
        taskId,
        actor: user.id,
      });
      task = await getTaskById(db, taskId);
    }
    assert.ok(task);

    let runs = await listRunsForTask(db, workspaceId, taskId);
    if (runs.length === 0) {
      const enqueued = await enqueueAgentRun(db, {
        workspaceId,
        projectId,
        taskId,
        idempotencyKey: `sentry-e2e:${taskId}:1`,
      });
      runs = [enqueued.run];
    }

    const run = runs[0]!;
    const claimed = await claimRunById(db, run.id, "sentry-e2e-worker", 60_000);
    assert.ok(claimed);

    const log = createLogger({ service: "e2e-sentry-wedge", level: "error" });
    const outcome = await executeClaimedRun(db, {
      run: claimed!,
      workerId: "sentry-e2e-worker",
      log,
      leaseMs: 60_000,
      agent: new FakeCodingAgent(),
    });
    assert.equal(outcome, "review_required");

    const afterRun = await getAgentRun(db, run.id);
    assert.equal(afterRun?.status, "REVIEW_REQUIRED");
    assert.ok(afterRun?.prUrl);
    assert.ok(afterRun?.headSha);

    await ingestCiEvidence(db, {
      workspaceId,
      headSha: afterRun!.headSha,
      name: "test",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 99,
      detailsUrl: null,
      repoFullName: null,
    });

    const arts = await listArtifactsForRun(db, workspaceId, run.id);
    assert.ok(arts.some((a) => a.kind === "delivery_report"));
  });
});
