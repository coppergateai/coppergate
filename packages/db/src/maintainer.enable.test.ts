import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { eq } from "drizzle-orm";
import {
  closeDb,
  connectRepository,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  enableMaintainerMode,
  getWorkspaceSpendSummary,
  insertTestUser,
  setWorkspaceBudget,
  upsertGithubInstallation,
} from "./index.js";
import { auditEvents, projects } from "./schema.js";

const url = process.env.DATABASE_URL;

describe("AG-030 enableMaintainerMode no silent escalation", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `ag030-${stamp}`,
      githubUserId: `gh-ag030-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "AG-030 WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-ag030-${stamp}`,
      accountLogin: "org-ag030",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: String(930_000 + (stamp % 1000)),
      owner: "org-ag030",
      name: "primary",
      defaultBranch: "main",
      baseRepoFullName: "org-ag030/primary",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "primary",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
        stack: "go",
      })
    ).project.id;

    await setWorkspaceBudget(db, {
      workspaceId,
      capMicros: 1_500_000,
      actor,
      period: "monthly",
      status: "active",
      pauseProjectBudgets: true,
    });
  });

  after(async () => {
    await closeDb(db);
  });

  it("does not raise workspace spend cap or apply stripped policy on enable", async () => {
    const { policy } = await enableMaintainerMode(db, {
      workspaceId,
      projectId,
      actor,
      policy: {
        monthlyBudgetMicros: 8_000_000,
        coordinatedMultiRepo: true,
        autoRelease: true,
        allowedSignalProviders: ["*", "rogue_signal"],
      },
    });

    const ws = await getWorkspaceSpendSummary(db, workspaceId);
    assert.ok(ws);
    assert.equal(ws!.capMicros, 1_500_000);
    assert.equal(policy.monthlyBudgetMicros, 1_500_000);
    assert.equal(policy.coordinatedMultiRepo, false);
    assert.equal(policy.autoRelease, false);
    assert.ok(!policy.allowedSignalProviders.includes("rogue_signal"));

    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    assert.equal(proj!.autonomyLevel, "L2");
    assert.equal(proj!.mergeEnabled, true);
    assert.equal(proj!.maintainerEnabled, true);

    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "maintainer.enable"));
    const enableAudit = audits.find((a) => a.targetId === projectId);
    assert.ok(enableAudit);
    const meta = JSON.parse(enableAudit!.meta ?? "{}") as {
      escalationClamps?: { monthlyBudgetClamped?: boolean };
    };
    assert.equal(meta.escalationClamps?.monthlyBudgetClamped, true);
  });
});
