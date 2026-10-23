import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "@coppergate/telemetry";
import { FakeCodingAgent, type CodingAgent } from "@coppergate/agents";
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
  ingestSonarFitness,
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
 * Closed loop: Sonar / CI-fail → auto-arm → arena → sandbox agent → PR → fitness.
 * Proves D13 vertical without live staging secrets.
 */
const url = process.env.DATABASE_URL;

async function seedWorkspace(db: ReturnType<typeof createDb>, stamp: number) {
  const user = await insertTestUser(db, {
    login: `sig-e2e-${stamp}`,
    githubUserId: `gh-sig-e2e-${stamp}`,
  });
  const workspaceId = (
    await createWorkspaceWithOwner(db, {
      name: "Signal E2E",
      ownerUserId: user.id,
    })
  ).workspace.id;

  const install = await upsertGithubInstallation(db, {
    workspaceId,
    githubInstallationId: `inst-sig-${stamp}`,
    accountLogin: "org-sig",
    status: "active",
  });
  const conn = await connectRepository(db, {
    workspaceId,
    installationId: install.id,
    githubRepoId: `${stamp}`,
    owner: "org-sig",
    name: "app",
    defaultBranch: "main",
    baseRepoFullName: "org-sig/app",
  });
  const projectId = (
    await createProjectWithRepo(db, {
      workspaceId,
      name: "Signal App",
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
    rawIdea: "Keep quality gates green",
    content: {
      title: "Quality loop",
      targetUser: "Engineer",
      problem: "Signals must become PRs",
      scope: "Signal arm path",
      nonGoals: "L3 deploy",
      acceptanceCriteria: ["Signal arms a reviewable PR"],
      clarifyingAnswers: [],
    },
  });
  await approveBrief(db, {
    workspaceId,
    projectId,
    briefId: draft.id,
    actor: user.id,
  });

  // Funded arena so signal auto-arm + spawn can fan out without "no active contenders".
  await ensureArenaForProject(db, {
    workspaceId,
    projectId,
    actor: user.id,
    minHuman: false,
    defaultContenderN: 2,
    contenderCount: 2,
    contenderBudgetMicros: 200_000,
  });

  return { workspaceId, projectId, actor: user.id };
}

async function runClosedLoop(
  db: ReturnType<typeof createDb>,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    provider: "sonar" | "ci_failure";
    envelope: Parameters<typeof ingestSignal>[1]["envelope"];
    agent?: CodingAgent;
  },
) {
  const log = createLogger({ service: "e2e-signal-closed-loop", level: "error" });

  await ensureDefaultAutoArmRule(db, {
    workspaceId: input.workspaceId,
    provider: input.provider,
    actor: input.actor,
    profileKeys:
      input.provider === "sonar" ? ["fixer", "security"] : ["fixer"],
  });

  const ingested = await ingestSignal(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    envelope: input.envelope,
  });

  assert.equal(ingested.duplicate, false);
  assert.equal(ingested.armed, true);
  assert.ok(ingested.task);

  const taskId = ingested.task!.id;
  let task = await getTaskById(db, taskId);
  assert.ok(task);

  if (task.status === "READY_FOR_APPROVAL") {
    await approveTask(db, {
      workspaceId: input.workspaceId,
      taskId,
      actor: input.actor,
    });
    task = await getTaskById(db, taskId);
  }

  assert.ok(task);
  assert.ok(
    ["QUEUED", "RUNNING", "READY_FOR_APPROVAL"].includes(task.status),
    `unexpected task status after arm/approve: ${task.status}`,
  );

  if (task.status === "READY_FOR_APPROVAL") {
    await approveTask(db, {
      workspaceId: input.workspaceId,
      taskId,
      actor: input.actor,
    });
  }

  let runs = await listRunsForTask(db, input.workspaceId, taskId);
  if (runs.length === 0) {
    const enqueued = await enqueueAgentRun(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId,
      idempotencyKey: `sig-e2e:${taskId}:1`,
    });
    runs = [enqueued.run];
  }

  const run = runs[0]!;
  const claimed = await claimRunById(db, run.id, "sig-e2e-worker", 60_000);
  assert.ok(claimed);

  const agent = input.agent ?? new FakeCodingAgent();

  const outcome = await executeClaimedRun(db, {
    run: claimed!,
    workerId: "sig-e2e-worker",
    log,
    leaseMs: 60_000,
    agent,
  });
  assert.equal(outcome, "review_required");

  const afterRun = await getAgentRun(db, run.id);
  assert.equal(afterRun?.status, "REVIEW_REQUIRED");
  assert.ok(afterRun?.prUrl);
  assert.ok(afterRun?.sandboxId, "sandbox should be attached on local mode");

  const taskReview = await getTaskById(db, taskId);
  assert.equal(taskReview?.status, "REVIEW_REQUIRED");

  const arts = await listArtifactsForRun(db, input.workspaceId, run.id);
  assert.ok(arts.some((a) => a.kind === "validation_report"));
  assert.ok(arts.some((a) => a.kind === "diff_summary"));
  assert.ok(arts.some((a) => a.kind === "delivery_report"));

  // Fitness gate after delivery (plan: PR → CI / quality fitness).
  assert.ok(afterRun?.headSha, "delivery must persist headSha for fitness attach");
  if (input.provider === "sonar") {
    const fitness = await ingestSonarFitness(db, {
      runId: run.id,
      workspaceId: input.workspaceId,
      headSha: afterRun!.headSha,
      gateStatus: "OK",
      projectKey: "org-sig/app",
      detailsUrl: "https://sonar.example/dashboard",
    });
    assert.equal(fitness.attached, true);
  } else {
    const fitness = await ingestCiEvidence(db, {
      headSha: afterRun!.headSha,
      name: "test",
      status: "completed",
      conclusion: "success",
      passed: true,
      blocksAccept: false,
      checkRunId: 42,
      detailsUrl: "https://github.com/org-sig/app/actions",
      repoFullName: "org-sig/app",
    });
    assert.equal(fitness.attached, true);
  }

  return {
    taskId,
    runId: run.id,
    sandboxId: afterRun!.sandboxId!,
    headSha: afterRun!.headSha!,
  };
}

describe("e2e signal closed loop", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const seeded = await seedWorkspace(db, Date.now());
    workspaceId = seeded.workspaceId;
    projectId = seeded.projectId;
    actor = seeded.actor;
  });

  after(async () => {
    await closeDb(db);
  });

  it("Sonar → auto-arm → FakeAgent → REVIEW_REQUIRED", async () => {
    const stamp = Date.now();
    const result = await runClosedLoop(db, {
      workspaceId,
      projectId,
      actor,
      provider: "sonar",
      envelope: {
        provider: "sonar",
        externalId: `sonar-e2e-${stamp}`,
        fingerprint: `sonar:e2e:${stamp}`,
        severity: "high",
        title: "Quality gate ERROR",
        body: "Coverage below threshold on main",
        repoHint: "org-sig/app",
        urls: ["https://sonar.example/dashboard"],
        labels: ["sonar"],
      },
      agent: new FakeCodingAgent(),
    });
    assert.ok(result.sandboxId.startsWith("local_"));
  });

  it("CI-fail → auto-arm → FakeAgent → REVIEW_REQUIRED", async () => {
    const stamp = Date.now() + 1;
    await runClosedLoop(db, {
      workspaceId,
      projectId,
      actor,
      provider: "ci_failure",
      envelope: {
        provider: "ci_failure",
        externalId: `ci-e2e-${stamp}`,
        fingerprint: `ci_failure:github:org-sig/app:test:${stamp}`,
        severity: "high",
        title: "CI failed: test (org-sig/app)",
        body: "CI failed: test\nconclusion: failure",
        repoHint: "org-sig/app",
        urls: ["https://github.com/org-sig/app/actions"],
        labels: ["ci_failure", "github", "failure"],
      },
      agent: new FakeCodingAgent(),
    });
  });
});
