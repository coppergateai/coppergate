import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, createDb } from "./client.js";
import { recordWebhookDelivery } from "./webhooks.js";

const url = process.env.DATABASE_URL;

describe("webhook delivery idempotency", { skip: !url }, () => {
  const db = createDb(url!, { max: 1 });
  const deliveryId = `del-idem-${Date.now()}`;

  after(async () => {
    await closeDb(db);
  });

  before(async () => {
    const first = await recordWebhookDelivery(db, {
      deliveryId,
      event: "ping",
      payload: "{}",
    });
    assert.equal(first.kind, "inserted");
  });

  it("replays return duplicate without a second insert", async () => {
    const replay = await recordWebhookDelivery(db, {
      deliveryId,
      event: "ping",
      payload: "{}",
    });
    assert.equal(replay.kind, "duplicate");
    assert.equal(replay.delivery.deliveryId, deliveryId);
  });
});
