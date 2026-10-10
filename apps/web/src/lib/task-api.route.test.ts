import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("task API routes", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("approve rejects without CSRF Origin", async () => {
    const { POST } = await import("../app/api/tasks/[id]/approve/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/tasks/t1/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("retry rejects without CSRF Origin", async () => {
    const { POST } = await import("../app/api/tasks/[id]/retry/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/tasks/t1/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("review rejects without CSRF Origin", async () => {
    const { POST } = await import("../app/api/tasks/[id]/review/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/tasks/t1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1", decision: "accept" }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    assert.equal(res.status, 403);
  });
});
