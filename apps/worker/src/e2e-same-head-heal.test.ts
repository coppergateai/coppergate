import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "@coppergate/telemetry";
import { FakeCodingAgent } from "@coppergate/agents";
import { FakeGithubDelivery } from "@coppergate/github";
import {
  agentRuns,
  approveBrief,
  approveTask,
  armSameHeadHealRun,
  claimRunById,
  closeDb,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  generateProjectPlan,
  getAgentRun,
  getSameHeadHealContext,
  getTaskById,
  ingestCiEvidence,
  insertTestUser,
  listRunsForTask,
  setProjectBudget,
  submitTaskForApproval,
  tasks,
  upsertGithubInstallation,
} from "@coppergate/db";
import { eq } from "drizzle-orm";
import { projects } from "@coppergate/db";
import { executeClaimedRun } from "./execute.js";

/**
 * Same-head heal: red CI on a delivery PR → fix run on the PR head →
 * commit lands on the same branch / same PR (no parallel PR from main).
 */
const url = process.env.DATABASE_URL;

describe("e2e same-head CI heal (FakeAgent)", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  const log = createLogger({ service: "e2e-same-head", level: "error" });
  let workspaceId = "";
  let projectId = "";
  let actor = "";
  let taskId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `e2e-sh-${stamp}`,
      githubUserId: `gh-e2e-sh-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "E2E Same Head",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-e2e-sh-${stamp}`,
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
        name: "E2E Same Head App",
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

  it("red CI → same-head run pushes onto the same PR; capped at 2 attempts", async () => {
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

    const github = new FakeGithubDelivery();
    const agent = new FakeCodingAgent();
    // approveTask already queued attempt 1 — deliver that run.
    const run = (await listRunsForTask(db, workspaceId, taskId)).find(
      (r) => r.status === "QUEUED",
    )!;
    assert.ok(run);
    const claimed = await claimRunById(db, run.id, "e2e-worker", 60_000);
    assert.ok(claimed);
    await executeClaimedRun(db, {
      run: claimed!,
      workerId: "e2e-worker",
      log,
      leaseMs: 60_000,
      agent,
      github,
    });
    const delivered = await getAgentRun(db, run.id);
    assert.ok(delivered?.prNumber && delivered.headSha && delivered.branchName);

    // Simulate live CI: delivery waits on CI, then the required check fails.
    const redCi = async (headSha: string) => {
      await db
        .update(tasks)
        .set({ status: "WAITING_CI" })
        .where(eq(tasks.id, taskId));
      await ingestCiEvidence(db, {
        workspaceId,
        headSha,
        name: "check",
        status: "completed",
        conclusion: "failure",
        passed: false,
        blocksAccept: true,
        checkRunId: 9001,
        detailsUrl: "https://github.com/org-e2e/app/actions/runs/1/job/9001",
        repoFullName: "org-e2e/app",
      });
    };
    const runHeal = async (runId: string) => {
      const healClaim = await claimRunById(db, runId, "e2e-worker", 60_000);
      assert.ok(healClaim);
      return executeClaimedRun(db, {
        run: healClaim!,
        workerId: "e2e-worker",
        log,
        leaseMs: 60_000,
        agent,
        github,
      });
    };

    await db
      .update(agentRuns)
      .set({ status: "WAITING_CI" })
      .where(eq(agentRuns.id, run.id));
    await redCi(delivered!.headSha!);
    assert.equal((await getAgentRun(db, run.id))?.errorCode, "ci_failed");

    const armed = await armSameHeadHealRun(db, {
      workspaceId,
      projectId,
      taskId,
      actor: "test",
      reason: "ci_failure",
    });
    assert.equal(armed.armed, true, JSON.stringify(armed));
    assert.equal(armed.attempt, 1);
    assert.equal((await getTaskById(db, taskId))?.status, "QUEUED");

    const superseded = await getAgentRun(db, run.id);
    assert.equal(superseded?.status, "FAILED");
    assert.equal(superseded?.errorCode, "superseded_same_head");

    const healRun = await getAgentRun(db, armed.runId!);
    assert.equal(healRun?.baseSha, delivered!.headSha);
    assert.equal(healRun?.branchName, delivered!.branchName);
    const ctx = await getSameHeadHealContext(db, {
      workspaceId,
      runId: armed.runId!,
    });
    assert.equal(ctx?.prNumber, delivered!.prNumber);
    assert.deepEqual(ctx?.failingChecks.map((c) => c.name), ["check"]);

    await runHeal(armed.runId!);
    const healed = await getAgentRun(db, armed.runId!);
    assert.equal(healed?.prNumber, delivered!.prNumber, "same PR, no parallel PR");
    assert.equal(healed?.branchName, delivered!.branchName);
    assert.notEqual(healed?.headSha, delivered!.headSha);
    assert.equal(github.pullRequests.size, 1);
    assert.deepEqual(
      github.pushes.map((p) => p.branch),
      [delivered!.branchName, delivered!.branchName],
    );

    // Second red → attempt 2; third red → exhausted (no third heal run).
    await db
      .update(agentRuns)
      .set({ status: "WAITING_CI" })
      .where(eq(agentRuns.id, healed!.id));
    await redCi(healed!.headSha!);
    const second = await armSameHeadHealRun(db, {
      workspaceId,
      projectId,
      taskId,
      actor: "test",
      reason: "ci_failure",
    });
    assert.equal(second.attempt, 2);
    await runHeal(second.runId!);
    const healed2 = await getAgentRun(db, second.runId!);
    await db
      .update(agentRuns)
      .set({ status: "WAITING_CI" })
      .where(eq(agentRuns.id, healed2!.id));
    await redCi(healed2!.headSha!);
    const third = await armSameHeadHealRun(db, {
      workspaceId,
      projectId,
      taskId,
      actor: "test",
      reason: "ci_failure",
    });
    assert.deepEqual(third, { armed: false, skip: "exhausted" });
    const runs = await listRunsForTask(db, workspaceId, taskId);
    assert.equal(runs.length, 3);
    assert.equal(github.pullRequests.size, 1);
  });
});
