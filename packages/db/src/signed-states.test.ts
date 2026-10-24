import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tryConsumeSignedState } from "./signed-states.js";

describe("tryConsumeSignedState", () => {
  it("rejects empty jti without hitting the database", async () => {
    const db = {
      insert: () => {
        throw new Error("should not insert");
      },
    } as unknown as Parameters<typeof tryConsumeSignedState>[0];
    assert.equal(
      await tryConsumeSignedState(db, {
        jti: "  ",
        kind: "github_install",
        expiresAt: new Date(Date.now() + 60_000),
      }),
      false,
    );
  });
});
