import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("POST /api/auth/logout CSRF", () => {
  before(() => {
    process.env.DATABASE_URL ??=
      "postgresql://coppergate:coppergate@localhost:5433/coppergate";
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("rejects POST without Origin/Referer", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
      }),
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "forbidden");
  });

  it("rejects GET logout", async () => {
    const { GET } = await import("./route.js");
    const res = await GET(
      new Request("http://localhost:3000/api/auth/logout"),
    );
    assert.equal(res.status, 400);
  });
});
