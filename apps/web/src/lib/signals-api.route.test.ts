import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("signals API routes CSRF", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("auto-arm rule upsert rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/signals/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces/w1/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "fake" }),
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("signal ingest rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/signals/ingest/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces/w1/signals/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "fake" }),
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("signal arm rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/signals/[signalId]/arm/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces/w1/signals/s1/arm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "w1", signalId: "s1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("fitness ingest rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/workspaces/[id]/signals/fitness/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces/w1/signals/fitness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "e2e", passed: true }),
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });
});
