import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("GET /health", () => {
  before(() => {
    process.env.DATABASE_URL ??=
      "postgresql://coppergate:coppergate@localhost:5433/coppergate";
  });

  it("returns ok with correlation id", async () => {
    const { GET } = await import("./route.js");
    const req = new Request("http://localhost/health", {
      headers: { "x-correlation-id": "test-cid" },
    });
    const res = GET(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-correlation-id"), "test-cid");
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
  });
});
