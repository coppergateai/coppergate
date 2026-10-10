import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("brief API routes", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("generate rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/brief/generate/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/brief/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "w1",
          idea: "Build something",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("tasks/start rejects without CSRF Origin", async () => {
    const { POST } = await import(
      "../app/api/projects/[id]/tasks/start/route.js"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/tasks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    assert.equal(res.status, 403);
  });
});
