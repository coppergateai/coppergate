import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  createLlmByok,
  getLlmByokById,
  listLlmByok,
  setDefaultLlmByok,
  updateWorkspaceAgentProfile,
  getEffectiveAgentProfile,
} from "./index.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("multi-LLM BYOK connections", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let ownerId = "";
  let workspaceId = "";

  before(async () => {
    const stamp = Date.now();
    const owner = await insertTestUser(db, {
      login: `llm-${stamp}`,
      githubUserId: `gh-llm-${stamp}`,
    });
    ownerId = owner.id;
    const ws = await createWorkspaceWithOwner(db, {
      name: `LLM WS ${stamp}`,
      ownerUserId: ownerId,
    });
    workspaceId = ws.workspace.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("creates two OpenAI connections via reuseKeyFromId", async () => {
    const first = await createLlmByok(db, {
      workspaceId,
      actor: ownerId,
      vendor: "openai",
      label: "openai-gpt-4o-mini",
      encryptedPayload: "sealed-key-A",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      setDefault: true,
    });
    assert.equal(first.isDefault, true);
    assert.equal(first.vendor, "openai");

    const second = await createLlmByok(db, {
      workspaceId,
      actor: ownerId,
      vendor: "openai",
      label: "openai-gpt-4o",
      reuseKeyFromId: first.id,
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    });
    assert.equal(second.model, "gpt-4o");
    assert.equal(second.isDefault, false);

    const row = await getLlmByokById(db, workspaceId, second.id);
    assert.ok(row);
    assert.equal(row!.encryptedPayload, "sealed-key-A");

    const listed = await listLlmByok(db, workspaceId);
    assert.ok(listed.length >= 2);

    await setDefaultLlmByok(db, {
      workspaceId,
      id: second.id,
      actor: ownerId,
    });
    const after = await listLlmByok(db, workspaceId);
    assert.equal(after.find((c) => c.id === second.id)?.isDefault, true);
    assert.equal(after.find((c) => c.id === first.id)?.isDefault, false);
  });

  it("rejects reuseKeyFromId from missing credential", async () => {
    await assert.rejects(
      () =>
        createLlmByok(db, {
          workspaceId,
          actor: ownerId,
          vendor: "openai",
          label: "openai-missing-reuse",
          reuseKeyFromId: crypto.randomUUID(),
          model: "gpt-4o",
        }),
      (err: unknown) =>
        err instanceof Error && /reuseKeyFromId not found/.test(err.message),
    );
  });

  it("routes agent profile to a specific connection + preferred model", async () => {
    const listed = await listLlmByok(db, workspaceId);
    const target = listed.find((c) => c.label === "openai-gpt-4o") ?? listed[0]!;
    const profile = await updateWorkspaceAgentProfile(db, {
      workspaceId,
      key: "fixer",
      actor: `user:${ownerId}`,
      llmCredentialId: target.id,
      preferredModel: "gpt-4o",
    });
    assert.equal(profile.llmCredentialId, target.id);
    assert.equal(profile.preferredModel, "gpt-4o");

    const effective = await getEffectiveAgentProfile(db, workspaceId, "fixer");
    assert.ok(effective);
    assert.equal(effective!.llmCredentialId, target.id);
    assert.equal(effective!.preferredModel, "gpt-4o");
  });
});
