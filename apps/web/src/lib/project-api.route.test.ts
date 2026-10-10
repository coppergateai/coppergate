import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("POST /api/projects", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects without CSRF Origin", async () => {
    const { POST } = await import("../app/api/projects/route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "w1",
          name: "Nope",
          mode: "existing_repo",
          repositoryConnectionId: "r1",
        }),
      }),
    );
    assert.equal(res.status, 403);
  });
});
