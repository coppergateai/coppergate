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
  enqueueAgentRun,
  generateProjectPlan,
  getAgentRun,
  getTaskById,
  getValidationReportForRun,
  insertTestUser,
  listArtifactsForRun,
  listRunEvents,
  parseArtifactMeta,
  requestCancelRun,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
} from "@coppergate/db";
import { eq } from "drizzle-orm";
import { projects, tasks } from "@coppergate/db";
import { executeClaimedRun } from "./execute.js";

const url = process.env.DATABASE_URL;

describe("executeClaimedRun + FakeCodingAgent", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  const log = createLogger({ service: "test-worker", level: "error" });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";
  let runId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `ex-${stamp}`,
      githubUserId: `gh-ex-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Exec WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-ex-${stamp}`,
      accountLogin: "org-ex",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "911",
      owner: "org-ex",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-ex/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Exec App",
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
    await db
      .update(projects)
      .set({ autonomyLevel: "L1" })
      .where(eq(projects.id, projectId));

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "exec",
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
              title: "Exec task",
              goal: "Add form",
              scope: "Landing",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["Works"],
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
    await submitTaskForApproval(db, { workspaceId, taskId, actor });
    await approveTask(db, { workspaceId, taskId, actor });
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `task:${taskId}:attempt:1`,
    });
    runId = run.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("fake completion reaches REVIEW_REQUIRED and never DONE", async () => {
    const claimed = await claimRunById(db, runId, "exec-worker", 60_000);
    assert.ok(claimed);

    const outcome = await executeClaimedRun(db, {
      run: claimed!,
      workerId: "exec-worker",
      log,
      leaseMs: 60_000,
    });
    assert.equal(outcome, "review_required");

    const run = await getAgentRun(db, runId);
    assert.equal(run?.status, "REVIEW_REQUIRED");
    assert.ok(run?.prUrl);
    assert.ok(run?.branchName?.startsWith("coppergate/task-"));
    assert.notEqual(run?.status, "DONE");

    const task = await getTaskById(db, taskId);
    assert.equal(task?.status, "REVIEW_REQUIRED");
    assert.notEqual(task?.status, "DONE");
    assert.notEqual(task?.status, "ACCEPTED");

    const events = await listRunEvents(db, runId);
    assert.ok(events.some((e) => e.kind === "completion"));
    assert.ok(events.some((e) => e.kind === "evidence"));
  });

  it("writes validation artifact and never auto-completes to DONE", async () => {
    const run = await getAgentRun(db, runId);
    assert.equal(run?.status, "REVIEW_REQUIRED");
    const report = await getValidationReportForRun(db, workspaceId, runId);
    assert.ok(report);
    assert.equal(report!.kind, "validation_report");
    const meta = parseArtifactMeta(report!);
    assert.equal(meta.passed, true);
    const task = await getTaskById(db, taskId);
    assert.notEqual(task?.status, "DONE");
  });

  it("persists redacted diff_summary and delivery_report artifacts", async () => {
    const arts = await listArtifactsForRun(db, workspaceId, runId);
    const diff = arts.find((a) => a.kind === "diff_summary");
    const delivery = arts.find((a) => a.kind === "delivery_report");
    assert.ok(diff);
    assert.ok(delivery);
    const diffMeta = parseArtifactMeta(diff!);
    const deliveryMeta = parseArtifactMeta(delivery!);
    assert.ok(typeof diffMeta.inlineBody === "string");
    assert.ok(typeof deliveryMeta.inlineBody === "string");
    const diffBody = JSON.parse(String(diffMeta.inlineBody)) as {
      kind: string;
      files: unknown[];
    };
    const deliveryBody = JSON.parse(String(deliveryMeta.inlineBody)) as {
      kind: string;
      prUrl: string;
      filesChanged: unknown[];
    };
    assert.equal(diffBody.kind, "diff_summary");
    assert.ok(diffBody.files.length >= 1);
    assert.equal(deliveryBody.kind, "delivery_report");
    assert.ok(deliveryBody.prUrl.includes("/pull/"));
    assert.ok(deliveryBody.filesChanged.length >= 1);
  });

  it("validation failure blocks REVIEW_REQUIRED and marks FAILED", async () => {
    await db
      .update(tasks)
      .set({
        goal: "Intentionally break [FAIL_VALIDATION]",
        status: "QUEUED",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `fail-val-${Date.now()}`,
    });
    const claimed = await claimRunById(db, run.id, "fail-val-w", 60_000);
    assert.ok(claimed);

    const outcome = await executeClaimedRun(db, {
      run: claimed!,
      workerId: "fail-val-w",
      log,
      leaseMs: 60_000,
    });
    assert.equal(outcome, "validation_failed");

    const after = await getAgentRun(db, run.id);
    assert.equal(after?.status, "FAILED");
    assert.equal(after?.errorCode, "validation_failed");
    assert.notEqual(after?.status, "REVIEW_REQUIRED");
    assert.notEqual(after?.status, "DONE");

    const task = await getTaskById(db, taskId);
    assert.equal(task?.status, "FAILED");

    const report = await getValidationReportForRun(db, workspaceId, run.id);
    assert.ok(report);
    assert.equal(parseArtifactMeta(report!).passed, false);

    const events = await listRunEvents(db, run.id);
    assert.ok(events.some((e) => e.kind === "completion"));
    assert.ok(events.some((e) => e.kind === "evidence"));
  });

  it("cancel stops fake agent within lease period", async () => {
    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `cancel-live-${Date.now()}`,
    });
    const claimed = await claimRunById(db, run.id, "cancel-worker", 60_000);
    assert.ok(claimed);

    // Request cancel shortly after start; agent steps with delay so it observes.
    const cancelTimer = setTimeout(() => {
      void requestCancelRun(db, {
        workspaceId,
        runId: run.id,
        actor,
      });
    }, 40);

    const outcome = await executeClaimedRun(db, {
      run: claimed!,
      workerId: "cancel-worker",
      log,
      leaseMs: 60_000,
      agent: new FakeCodingAgent({ stepDelayMs: 80 }),
    });
    clearTimeout(cancelTimer);

    assert.equal(outcome, "cancelled");
    const after = await getAgentRun(db, run.id);
    assert.equal(after?.status, "FAILED");
    assert.equal(after?.errorCode, "cancelled");
    assert.ok(after?.cancelRequestedAt);

    const events = await listRunEvents(db, run.id);
    assert.ok(
      events.some(
        (e) =>
          e.kind === "error" && e.payload.includes("cancelled"),
      ),
    );
  });
});
