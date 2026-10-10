import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??=
  "postgresql://coppergate:coppergate@localhost:5433/coppergate";
process.env.APP_URL ??= "http://localhost:3000";

describe("approvals inbox API", () => {
  before(() => {
    process.env.APP_URL ??= "http://localhost:3000";
  });

  it("requires authentication", async () => {
    const { GET } = await import(
      "../app/api/workspaces/[id]/approvals/route.js"
    );
    const res = await GET(
      new Request("http://localhost:3000/api/workspaces/w1/approvals"),
      { params: Promise.resolve({ id: "w1" }) },
    );
    assert.equal(res.status, 401);
  });
});
