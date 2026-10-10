import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = GET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
  });
});
