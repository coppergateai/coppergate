import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  approveBrief,
  closeDb,
  closeFailedTasksShippedByMergedPrs,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  connectRepository,
  generateProjectPlan,
  getTaskById,
  insertTestUser,
  setProjectBudget,
  tasks,
  upsertGithubInstallation,
} from "@coppergate/db";
import { eq, inArray } from "drizzle-orm";
import { projects } from "@coppergate/db";

/** Stale FAILED tasks whose Open ID shipped via a merged PR leave the board. */
const url = process.env.DATABASE_URL;

describe("close FAILED tasks shipped by merged PRs", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `e2e-cs-${stamp}`,
      githubUserId: `gh-e2e-cs-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "E2E Closed Shipped",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-e2e-cs-${stamp}`,
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
        name: "E2E Closed Shipped App",
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

  it("cancels only FAILED tasks whose Open ID is merged, citing the PR", async () => {
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
              key: "ag016",
              title: "AG-016: Provider failover spend accounting",
              goal: "Add primary CTA on landing",
              scope: "app/page.tsx",
              allowedPaths: ["app/page.tsx"],
              acceptanceCriteria: ["CTA renders"],
              estimateMicros: 50_000,
              estimateComplexity: "S",
              dependsOn: [],
              priority: 1,
            },
            {
              key: "ag022",
              title: "AG-022: Docs-drift signal wire",
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
    const [shipped, open] = plan.milestones[0]!.tasks.map((t) => t.task.id);
    await db
      .update(tasks)
      .set({ status: "FAILED" })
      .where(inArray(tasks.id, [shipped!, open!]));

    const closed = await closeFailedTasksShippedByMergedPrs(db, {
      workspaceId,
      projectId,
      merged: new Map([["AG-016", 188]]),
      actor: "test",
    });
    assert.deepEqual(closed, [shipped]);
    assert.equal((await getTaskById(db, shipped!))?.status, "CANCELLED");
    assert.equal((await getTaskById(db, open!))?.status, "FAILED");

    // Idempotent: nothing FAILED left for AG-016.
    const again = await closeFailedTasksShippedByMergedPrs(db, {
      workspaceId,
      projectId,
      merged: new Map([["AG-016", 188]]),
      actor: "test",
    });
    assert.deepEqual(again, []);
  });
});
