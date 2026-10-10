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
  decideTaskReview,
  enqueueAgentRun,
  generateProjectPlan,
  getAgentRun,
  getProjectSpendSummary,
  getTaskById,
  insertTestUser,
  listArtifactsForRun,
  parseArtifactMeta,
  setProjectBudget,
  submitTaskForApproval,
  upsertGithubInstallation,
} from "@coppergate/db";
import { eq } from "drizzle-orm";
import { projects } from "@coppergate/db";
import { executeClaimedRun } from "./execute.js";

/**
 * TASK029 — MVP exit checklist (fake path).
 * Connect → brief → plan → approve task → FakeAgent PR + evidence → accept → DONE.
 */
const url = process.env.DATABASE_URL;

describe("e2e happy path (FakeAgent)", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  const log = createLogger({ service: "e2e-happy-path", level: "error" });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `e2e-${stamp}`,
      githubUserId: `gh-e2e-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "E2E Happy",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-e2e-${stamp}`,
      accountLogin: "org-e2e",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: `${stamp}`,
      owner: "org-e2e",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-e2e/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "E2E App",
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
  });

  after(async () => {
    await closeDb(db);
  });

  it("MVP exit: approve scoped task → PR + evidence + cost → accept DONE", async () => {
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "Landing CTA",
      content: {
        title: "Landing CTA",
        targetUser: "Founder",
        problem: "No CTA",
        scope: "Hero button",
        nonGoals: "Auth",
        acceptanceCriteria: ["CTA visible"],
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
          title: "Ship CTA",
          description: "",
          tasks: [
            {
              key: "cta",
              title: "Add hero CTA",
              goal: "Add primary CTA on landing",
              scope: "app/page.tsx",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["CTA renders"],
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

    await submitTaskForApproval(db, { workspaceId, taskId, actor });
    await approveTask(db, { workspaceId, taskId, actor });

    const { run } = await enqueueAgentRun(db, {
      workspaceId,
      projectId,
      taskId,
      idempotencyKey: `e2e:${taskId}:1`,
    });

    const claimed = await claimRunById(db, run.id, "e2e-worker", 60_000);
    assert.ok(claimed);

    const outcome = await executeClaimedRun(db, {
      run: claimed!,
      workerId: "e2e-worker",
      log,
      leaseMs: 60_000,
      agent: new FakeCodingAgent(),
    });
    assert.equal(outcome, "review_required");

    const afterRun = await getAgentRun(db, run.id);
    assert.equal(afterRun?.status, "REVIEW_REQUIRED");
    assert.ok(afterRun?.prUrl);
    assert.ok((afterRun?.actualCostMicros ?? 0) >= 0);

    const taskReview = await getTaskById(db, taskId);
    assert.equal(taskReview?.status, "REVIEW_REQUIRED");

    const arts = await listArtifactsForRun(db, workspaceId, run.id);
    assert.ok(arts.some((a) => a.kind === "validation_report"));
    assert.ok(arts.some((a) => a.kind === "diff_summary"));
    assert.ok(arts.some((a) => a.kind === "delivery_report"));
    const delivery = arts.find((a) => a.kind === "delivery_report")!;
    const body = JSON.parse(
      String(parseArtifactMeta(delivery).inlineBody),
    ) as { kind: string; filesChanged: string[]; prUrl: string };
    assert.equal(body.kind, "delivery_report");
    assert.ok(body.filesChanged.length >= 1);
    assert.ok(body.prUrl.includes("/pull/"));

    const spend = await getProjectSpendSummary(db, workspaceId, projectId);
    assert.ok(spend.spentMicros >= 0);
    assert.ok(spend.capMicros > 0);

    const accepted = await decideTaskReview(db, {
      workspaceId,
      taskId,
      actor,
      decision: "accept",
      note: "e2e accept",
    });
    assert.equal(accepted.task.status, "DONE");

    const done = await getTaskById(db, taskId);
    assert.equal(done?.status, "DONE");
  });
});
