import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("budget API routes", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("PUT budget rejects without CSRF", async () => {
    const { PUT } = await import("../app/api/projects/[id]/budget/route.js");
    const res = await PUT(
      new Request("http://localhost:3000/api/projects/p1/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "w1", capMicros: 1000 }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    assert.equal(res.status, 403);
  });
});
