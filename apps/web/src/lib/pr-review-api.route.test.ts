import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("POST /api/projects/:id/pulls CSRF", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects without Origin", async () => {
    const { POST } = await import("../app/api/projects/[id]/pulls/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/projects/p1/pulls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "w1",
          prNumber: 1,
          queue: true,
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    assert.equal(res.status, 403);
  });
});
