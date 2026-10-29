import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { eq } from "drizzle-orm";
import {
  approveBrief,
  closeDb,
  connectRepository,
  createBriefDraft,
  createDb,
  createProjectWithRepo,
  createWorkspaceWithOwner,
  defaultContenderNWithinMaintainerPolicy,
  ensureArenaForProject,
  getArenaForProject,
  insertTestUser,
  maintainerContenderPinN,
  runVisionReplan,
  serializeMaintainerPolicy,
  upsertGithubInstallation,
  DEFAULT_MAINTAINER_POLICY,
} from "./index.js";
import { arenas, projects } from "./schema.js";

const url = process.env.DATABASE_URL;

const ROADMAP_AG018 = `
## Agent reliability (AG)

| Status | ID | Title | Notes |
| --- | --- | --- | --- |
| Open | AG-018 | Contender N pin under replan | Must not drift defaultContenderN |
`;

describe("AG-018 replan contender N pin", { skip: !url }, () => {
  const db = createDb(url!, { max: 2 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `ag018-${stamp}`,
      githubUserId: `gh-ag018-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "AG-018 WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-ag018-${stamp}`,
      accountLogin: "org-ag018",
      status: "active",
    });
    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: String(940_000 + (stamp % 1000)),
      owner: "org-ag018",
      name: "primary",
      defaultBranch: "main",
      baseRepoFullName: "org-ag018/primary",
    });
    projectId = (
      await createProjectWithRepo(db, {
        workspaceId,
        name: "primary",
        mode: "existing_repo",
        repositoryConnectionId: conn.id,
        stack: "nextjs_ts",
      })
    ).project.id;

    await db
      .update(projects)
      .set({
        maintainerPolicyJson: serializeMaintainerPolicy({
          ...DEFAULT_MAINTAINER_POLICY,
          enabled: true,
          maxTournamentN: 2,
        }),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "dogfood replan",
      content: {
        title: "Vision",
        targetUser: "ops",
        problem: "Arena width drift",
        scope: "packages/db",
        nonGoals: "scaffold",
        acceptanceCriteria: ["pinned N"],
        clarifyingAnswers: [],
      },
    });
    await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });

    const { arena } = await ensureArenaForProject(db, {
      workspaceId,
      projectId,
      actor,
      defaultContenderN: 2,
      minHuman: true,
    });
    await db
      .update(arenas)
      .set({ defaultContenderN: 5, updatedAt: new Date() })
      .where(eq(arenas.id, arena.id));
  });

  after(async () => {
    await closeDb(db);
  });

  it("runVisionReplan re-pins defaultContenderN to maxTournamentN", async () => {
    const pin = maintainerContenderPinN(2);
    assert.equal(pin, 2);

    await runVisionReplan(db, {
      workspaceId,
      projectId,
      actor,
      autoQueue: false,
      roadmapMarkdown: ROADMAP_AG018,
    });

    const arena = await getArenaForProject(db, { workspaceId, projectId });
    assert.ok(arena);
    assert.equal(arena!.defaultContenderN, pin);
    assert.equal(
      defaultContenderNWithinMaintainerPolicy(arena!.defaultContenderN, 2),
      true,
    );
  });
});
