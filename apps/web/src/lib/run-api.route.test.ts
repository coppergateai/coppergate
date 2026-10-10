import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("run API routes", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("POST /tasks/{id}/runs rejects without CSRF", async () => {
    const { POST } = await import("../app/api/tasks/[id]/runs/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/tasks/t1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "w1",
          idempotencyKey: "k1",
        }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("POST /runs/{id}/cancel rejects without CSRF", async () => {
    const { POST } = await import("../app/api/runs/[id]/cancel/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/runs/r1/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    assert.equal(res.status, 403);
  });
});
