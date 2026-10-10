import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertCsrf } from "./csrf.js";

describe("assertCsrf", () => {
  it("allows GET without origin", () => {
    assert.doesNotThrow(() =>
      assertCsrf(new Request("http://localhost:3000/x"), "http://localhost:3000"),
    );
  });

  it("allows POST with matching Origin", () => {
    assert.doesNotThrow(() =>
      assertCsrf(
        new Request("http://localhost:3000/api/auth/logout", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
        "http://localhost:3000",
      ),
    );
  });

  it("rejects POST with bad Origin", () => {
    assert.throws(
      () =>
        assertCsrf(
          new Request("http://localhost:3000/api/auth/logout", {
            method: "POST",
            headers: { origin: "https://evil.example" },
          }),
          "http://localhost:3000",
        ),
      /CSRF/,
    );
  });
});
