import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("GET /api/workspaces/:id/github", () => {
  before(() => {
    process.env.DATABASE_URL ??=
      "postgresql://coppergate:coppergate@localhost:5433/coppergate";
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("requires authentication", async () => {
    const { GET } = await import("../app/api/workspaces/[id]/github/route.js");
    const res = await GET(
      new Request("http://localhost:3000/api/workspaces/w1/github"),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 401);
  });
});

describe("DELETE /api/workspaces/:id/github CSRF", () => {
  before(() => {
    process.env.DATABASE_URL ??=
      "postgresql://coppergate:coppergate@localhost:5433/coppergate";
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects without Origin", async () => {
    const { DELETE } = await import("../app/api/workspaces/[id]/github/route.js");
    const res = await DELETE(
      new Request("http://localhost:3000/api/workspaces/w1/github", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 403);
  });
});
