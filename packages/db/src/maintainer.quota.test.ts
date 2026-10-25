import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  closeDb,
  connectRepository,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  ensureArenaForProject,
  getArenaForProject,
  getWorkspaceMissionControl,
  insertTestUser,
  pauseArenaForProviderQuota,
  startProjectArena,
  upsertGithubInstallation,
  auditEvents,
  maintainerEvents,
} from "./index.js";
import { and, desc, eq } from "drizzle-orm";

const url = process.env.DATABASE_URL;

/**
 * AG-010: insufficient_quota fail-closed — Arena pauses and Mission Control
 * surfaces provider_quota; no further fan-out while paused.
 */
describe("AG-010 provider quota fail-closed", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `quota-${stamp}`,
      githubUserId: `gh-quota-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Quota WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-quota-${stamp}`,
      accountLogin: "org-quota",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: String(930_000 + (stamp % 1000)),
      owner: "org-quota",
      name: "quota-app",
      defaultBranch: "main",
      baseRepoFullName: "org-quota/quota-app",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "quota-app",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
        stack: "nextjs_ts",
      })
    ).project.id;
    await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: 1,
      minHuman: true,
      contenderBudgetMicros: 100_000,
    });
    await startProjectArena(db, { workspaceId, projectId, actor });
  });

  after(async () => {
    await closeDb(db);
  });

  it("pauses RUNNING arena and records Mission Control provider_quota", async () => {
    const before = await getArenaForProject(db, { workspaceId, projectId });
    assert.equal(before?.status, "RUNNING");

    const result = await pauseArenaForProviderQuota(db, {
      workspaceId,
      projectId,
      actor: `worker:ag010-${actor}`,
      detail: "insufficient_quota: You exceeded your current quota",
    });
    assert.equal(result.paused, true);
    assert.ok(result.arenaId);

    const after = await getArenaForProject(db, { workspaceId, projectId });
    assert.equal(after?.status, "PAUSED");

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, workspaceId),
          eq(auditEvents.action, "arena.pause_provider_quota"),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    assert.ok(audit);

    const [evt] = await db
      .select()
      .from(maintainerEvents)
      .where(
        and(
          eq(maintainerEvents.workspaceId, workspaceId),
          eq(maintainerEvents.projectId, projectId),
          eq(maintainerEvents.kind, "provider_quota"),
        ),
      )
      .orderBy(desc(maintainerEvents.createdAt))
      .limit(1);
    assert.ok(evt);

    const snap = await getWorkspaceMissionControl(db, workspaceId);
    const quota = snap.attention.find((a) => a.kind === "provider_quota");
    assert.ok(quota, "Mission Control must surface provider_quota attention");
    assert.match(quota.title, /quota/i);

    // Idempotent: second call stays paused, still reports paused.
    const again = await pauseArenaForProviderQuota(db, {
      workspaceId,
      projectId,
      actor: `worker:ag010-${actor}`,
      detail: "insufficient_quota retry",
    });
    assert.equal(again.paused, true);
    const still = await getArenaForProject(db, { workspaceId, projectId });
    assert.equal(still?.status, "PAUSED");
  });
});
