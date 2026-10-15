import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, createDb } from "./client.js";
import {
  getSignalEvent,
  ingestSignal,
  listSignalEvents,
} from "./signals.js";
import { createWorkspaceWithOwner, insertTestUser } from "./workspaces.js";

const url = process.env.DATABASE_URL;

/**
 * TASK123 — cross-tenant signal isolation (IDOR).
 * Skips when DATABASE_URL is unset.
 */
describe("signal events IDOR isolation", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  let wsA = "";
  let wsB = "";
  let signalA = "";

  before(async () => {
    const stamp = Date.now();
    const userA = await insertTestUser(db, {
      login: `sig-a-${stamp}`,
      githubUserId: `gh-sig-a-${stamp}`,
    });
    const userB = await insertTestUser(db, {
      login: `sig-b-${stamp}`,
      githubUserId: `gh-sig-b-${stamp}`,
    });
    wsA = (
      await createWorkspaceWithOwner(db, {
        name: "Sig A",
        ownerUserId: userA.id,
      })
    ).workspace.id;
    wsB = (
      await createWorkspaceWithOwner(db, {
        name: "Sig B",
        ownerUserId: userB.id,
      })
    ).workspace.id;

    const ingested = await ingestSignal(db, {
      workspaceId: wsA,
      envelope: {
        provider: "fake",
        externalId: `ext-${stamp}`,
        fingerprint: `fp-${stamp}`,
        severity: "high",
        title: "Tenant A only",
        body: "secret to A",
        labels: ["idor"],
      },
      actor: "test",
      skipAutoArm: true,
    });
    signalA = ingested.event.id;
  });

  after(async () => {
    await closeDb(db);
  });

  it("lists signals only within workspace", async () => {
    const a = await listSignalEvents(db, wsA);
    const b = await listSignalEvents(db, wsB);
    assert.equal(a.some((e) => e.id === signalA), true);
    assert.equal(b.some((e) => e.id === signalA), false);
  });

  it("getSignalEvent requires matching workspace", async () => {
    const own = await getSignalEvent(db, wsA, signalA);
    assert.ok(own);
    const cross = await getSignalEvent(db, wsB, signalA);
    assert.equal(cross, null);
  });
});
