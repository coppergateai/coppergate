import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/** Must match env loaded by `@/lib/env` before this file runs. */
const SECRET = "ci-webhook-secret-for-tests!!";
process.env.GITHUB_WEBHOOK_SECRET ??= SECRET;
process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("POST /api/integrations/github/webhook", () => {
  before(() => {
    process.env.GITHUB_WEBHOOK_SECRET ??= SECRET;
  });

  it("rejects unsigned payloads", async () => {
    const { POST } = await import(
      "../app/api/integrations/github/webhook/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/integrations/github/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "ping",
          "x-github-delivery": `unsigned-${Date.now()}`,
        },
        body: "{}",
      }),
    );
    assert.equal(res.status, 401);
  });

  it("rejects invalid signatures", async () => {
    const { POST } = await import(
      "../app/api/integrations/github/webhook/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/integrations/github/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "ping",
          "x-github-delivery": `bad-sig-${Date.now()}`,
          "x-hub-signature-256": "sha256=00",
        },
        body: "{}",
      }),
    );
    assert.equal(res.status, 401);
  });

  it("accepts a valid signature and ignores replay", async () => {
    const { POST } = await import(
      "../app/api/integrations/github/webhook/route.js"
    );
    const body = JSON.stringify({ zen: "Keep it logically awesome." });
    const deliveryId = `ok-${Date.now()}`;
    const sig =
      "sha256=" +
      createHmac("sha256", SECRET).update(body).digest("hex");

    const req = () =>
      new Request("http://localhost:3000/api/integrations/github/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "ping",
          "x-github-delivery": deliveryId,
          "x-hub-signature-256": sig,
        },
        body,
      });

    const first = await POST(req());
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.duplicate, undefined);

    const second = await POST(req());
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.duplicate, true);
  });
});
