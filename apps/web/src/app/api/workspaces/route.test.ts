import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("GET /api/workspaces", () => {
  before(() => {
    process.env.DATABASE_URL ??=
      "postgresql://coppergate:coppergate@localhost:5433/coppergate";
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("requires authentication", async () => {
    const { GET } = await import("./route.js");
    const res = await GET(new Request("http://localhost:3000/api/workspaces"));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "unauthorized");
  });
});

describe("POST /api/workspaces CSRF", () => {
  before(() => {
    process.env.DATABASE_URL ??=
      "postgresql://coppergate:coppergate@localhost:5433/coppergate";
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects POST without Origin/Referer", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    assert.equal(res.status, 403);
  });
});
