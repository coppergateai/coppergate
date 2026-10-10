import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDb } from "./client.js";

describe("checkDb", () => {
  it("returns false for an unreachable database", async () => {
    const ok = await checkDb(
      "postgresql://coppergate:coppergate@127.0.0.1:1/coppergate",
    );
    assert.equal(ok, false);
  });
});
