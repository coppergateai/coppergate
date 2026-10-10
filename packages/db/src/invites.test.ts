import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import {
  InviteError,
  createPilotInvite,
  normalizeInviteCode,
  redeemPilotInvite,
} from "./invites.js";
import { insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

describe("normalizeInviteCode", () => {
  it("uppercases and strips spaces", () => {
    assert.equal(normalizeInviteCode(" cg-ab 12 "), "CG-AB12");
  });
});

describe("pilot invites", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let userId = "";

  before(async () => {
    const user = await insertTestUser(db, {
      login: `inv-${Date.now()}`,
      githubUserId: `gh-inv-${Date.now()}`,
    });
    userId = user.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("redeems a fresh code once", async () => {
    const invite = await createPilotInvite(db, {
      code: `T-${Date.now().toString(36)}`,
      maxUses: 1,
    });
    const redeemed = await redeemPilotInvite(db, {
      code: invite.code,
      userId,
    });
    assert.equal(redeemed.useCount, 1);
    await assert.rejects(
      () => redeemPilotInvite(db, { code: invite.code, userId }),
      (err: unknown) => err instanceof InviteError && err.code === "exhausted",
    );
  });

  it("rejects unknown codes", async () => {
    await assert.rejects(
      () => redeemPilotInvite(db, { code: "NOPE-NOPE", userId }),
      (err: unknown) => err instanceof InviteError && err.code === "invalid",
    );
  });
});
