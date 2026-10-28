import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  BOUNDED_KEYS,
  createWorkspaceAgentProfile,
  deleteWorkspaceAgentProfile,
  getEffectiveAgentProfile,
  resolveSpawnProfileKeys,
  updateWorkspaceAgentProfile,
} from "./profiles.js";
import {
  deleteWorkspaceSkill,
  getEffectiveAgentSkill,
  upsertWorkspaceSkill,
} from "./skills.js";
import {
  assertProfileToolAllowlist,
  deleteWorkspaceToolDef,
  upsertWorkspaceToolDef,
} from "./tool-defs.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("catalog CRUD (profiles/skills/tools)", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let workspaceId = "";
  let actor = "";

  before(async () => {
    const stamp = Date.now();
    const user = await insertTestUser(db, { login: `catalog-${stamp}` });
    actor = `user:${user.id}`;
    workspaceId = (
      await createWorkspaceWithOwner(db, {
        name: "Catalog WS",
        ownerUserId: user.id,
      })
    ).workspace.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("creates custom agent, resolves it, deletes it", async () => {
    const created = await createWorkspaceAgentProfile(db, {
      workspaceId,
      key: "scout",
      displayName: "Scout",
      promptGuidance: "Explore and report.",
      actor,
      toolAllowlist: ["read", "git"],
    });
    assert.equal(created.key, "scout");
    assert.equal(created.workspaceId, workspaceId);
    assert.equal(BOUNDED_KEYS.has("scout"), false);

    const effective = await getEffectiveAgentProfile(db, workspaceId, "scout");
    assert.ok(effective);
    assert.equal(effective!.displayName, "Scout");

    const keys = resolveSpawnProfileKeys("fake", ["scout", "fixer"], ["scout"]);
    assert.deepEqual(keys, ["scout", "fixer"]);

    const del = await deleteWorkspaceAgentProfile(db, {
      workspaceId,
      key: "scout",
      actor,
    });
    assert.equal(del.deleted, true);
    assert.equal(del.resetToSystem, false);
    assert.equal(
      await getEffectiveAgentProfile(db, workspaceId, "scout"),
      null,
    );
  });

  it("overrides system agent and resets", async () => {
    await updateWorkspaceAgentProfile(db, {
      workspaceId,
      key: "engineer",
      actor,
      promptGuidance: "Workspace engineer guidance",
    });
    const over = await getEffectiveAgentProfile(db, workspaceId, "engineer");
    assert.ok(over?.workspaceId);
    assert.match(over!.promptGuidance, /Workspace engineer/);

    const reset = await deleteWorkspaceAgentProfile(db, {
      workspaceId,
      key: "engineer",
      actor,
    });
    assert.equal(reset.resetToSystem, true);
    const system = await getEffectiveAgentProfile(db, workspaceId, "engineer");
    assert.ok(system);
    assert.equal(system!.workspaceId, null);
  });

  it("upserts and deletes custom skill", async () => {
    const skill = await upsertWorkspaceSkill(db, {
      workspaceId,
      key: "ship-checklist",
      title: "Ship checklist",
      bodyMarkdown: "# Ship\n\n- Verify",
      actor,
    });
    assert.equal(skill.key, "ship-checklist");
    const hit = await getEffectiveAgentSkill(
      db,
      workspaceId,
      "ship-checklist",
    );
    assert.ok(hit);

    const del = await deleteWorkspaceSkill(db, {
      workspaceId,
      key: "ship-checklist",
      actor,
    });
    assert.equal(del.deleted, true);
    assert.equal(del.resetToSystem, false);
  });

  it("tool defs expand allowlist and reject escalation", async () => {
    const def = await upsertWorkspaceToolDef(db, {
      workspaceId,
      key: "docs-lint",
      title: "Docs lint",
      description: "Policy token",
      kind: "custom",
      actor,
    });
    assert.equal(def.key, "docs-lint");

    await assertProfileToolAllowlist(db, workspaceId, [
      "read",
      "docs-lint",
      "mcp:sonarqube",
    ]);

    await assert.rejects(
      () =>
        assertProfileToolAllowlist(db, workspaceId, ["read", "shell"]),
      /shell/,
    );

    await deleteWorkspaceToolDef(db, {
      workspaceId,
      key: "docs-lint",
      actor,
    });
  });
});
