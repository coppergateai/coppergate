import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  appendRunEvent,
  closeDb,
  createDb,
  createWorkspaceWithOwner,
  enqueueAgentRun,
  insertTestUser,
  listRunEvents,
} from "./index.js";
import { containsSecretMaterial } from "./redact.js";

const url = process.env.DATABASE_URL;

describe("run events never persist secrets", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let runId = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `redact-${stamp}`,
      githubUserId: `gh-redact-${stamp}`,
    });
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Redact WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    // Minimal project/task via raw enqueue needs real FKs — use projects helpers.
    const { upsertGithubInstallation, connectRepository, createProjectWithRepo, generateProjectPlan, createBriefDraft, approveBrief, setProjectBudget } =
      await import("./index.js");
    const { eq } = await import("drizzle-orm");
    const { projects } = await import("./schema.js");

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-redact-${stamp}`,
      accountLogin: "org-redact",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "914",
      owner: "org-redact",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-redact/app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "Redact App",
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
      rawIdea: "r",
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
              title: "T",
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
      idempotencyKey: `redact-${stamp}`,
    });
    runId = run.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("strips tokens from persisted event payload", async () => {
    await appendRunEvent(db, {
      runId,
      workspaceId,
      kind: "log",
      payload: {
        message:
          "clone with ghp_abcdefghijklmnopqrstuvwxyz012345 and Authorization header",
        authorization: "Bearer secrettokenvalue99",
        api_key: "sk-abcdefghijklmnopqrstuvwxyz",
      },
    });

    const events = await listRunEvents(db, runId);
    const last = events[events.length - 1]!;
    assert.equal(containsSecretMaterial(last.payload), false);
    assert.ok(last.payload.includes("[REDACTED]"));
    assert.ok(!last.payload.includes("ghp_"));
    assert.ok(!last.payload.includes("sk-"));
  });
});
