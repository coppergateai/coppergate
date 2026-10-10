import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  approveBrief,
  assertCanStartTasks,
  BriefError,
  createBriefDraft,
  updateBriefDraft,
} from "./briefs.js";
import { connectRepository, upsertGithubInstallation } from "./github.js";
import { createProjectWithRepo } from "./projects.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("product briefs", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let projectId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, {
      login: `brief-${stamp}`,
      githubUserId: `gh-brief-${stamp}`,
    });
    actor = user.id;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Brief WS",
        ownerUserId: user.id,
      })
    ).workspace.id;

    const install = await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: `inst-brief-${stamp}`,
      accountLogin: "org-brief",
      status: "active",
    });

    const conn = await connectRepository(db, {
      workspaceId,
      installationId: install.id,
      githubRepoId: "301",
      owner: "org-brief",
      name: "app",
      defaultBranch: "main",
      baseRepoFullName: "org-brief/app",
    });

    const created = await createProjectWithRepo(db, {
      workspaceId,
      name: "Brief App",
      mode: "existing_repo",
      repositoryConnectionId: conn.id,
    });
    projectId = created.project.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("blocks task start without approved brief", async () => {
    await assert.rejects(
      () => assertCanStartTasks(db, workspaceId, projectId),
      (err: unknown) =>
        err instanceof BriefError && err.code === "no_approved_brief",
    );
  });

  it("creates editable draft, approves, then allows task start", async () => {
    const draft = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "Build a waitlist landing page",
      content: {
        title: "Waitlist landing",
        targetUser: "Indie founders",
        problem: "No simple waitlist",
        scope: "Email capture + confirmation",
        nonGoals: "Payments",
        acceptanceCriteria: ["User can join waitlist"],
        clarifyingAnswers: [
          {
            id: "q1",
            question: "Who is the primary user?",
            answer: "Indie founders",
          },
        ],
      },
    });
    assert.equal(draft.status, "draft");
    assert.equal(draft.revision, 1);

    const edited = await updateBriefDraft(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
      patch: { scope: "Email capture + double opt-in" },
    });
    assert.equal(edited.scope, "Email capture + double opt-in");

    const approved = await approveBrief(db, {
      workspaceId,
      projectId,
      briefId: draft.id,
      actor,
    });
    assert.equal(approved.status, "approved");
    assert.ok(approved.approvedAt);

    const brief = await assertCanStartTasks(db, workspaceId, projectId);
    assert.equal(brief.id, approved.id);
  });

  it("rejects editing an approved brief", async () => {
    const latest = await createBriefDraft(db, {
      workspaceId,
      projectId,
      actor,
      rawIdea: "v2 idea",
      content: {
        title: "V2",
        targetUser: "Users",
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
      briefId: latest.id,
      actor,
    });
    await assert.rejects(
      () =>
        updateBriefDraft(db, {
          workspaceId,
          projectId,
          briefId: latest.id,
          actor,
          patch: { title: "Nope" },
        }),
      (err: unknown) => err instanceof BriefError && err.code === "not_draft",
    );
  });
});
