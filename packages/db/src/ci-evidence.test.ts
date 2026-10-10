import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  closeDb,
  createDb,
  createWorkspaceWithOwner,
  enqueueAgentRun,
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
  const headSha = "ciheadsha001";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `ci-${stamp}`,
      githubUserId: `gh-ci-${stamp}`,
    });
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
});
