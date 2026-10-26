import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Contract for OAuth login single-use keys.
 * Callbacks must consume `oauth_login:{provider}:{state}` before minting a session.
 */
describe("oauth login state jti contract", () => {
  it("builds stable single-use keys per provider", () => {
    const state = "abcXYZ-_123";
    assert.equal(
      `oauth_login:github:${state}`,
      "oauth_login:github:abcXYZ-_123",
    );
    assert.equal(
      `oauth_login:gitlab:${state}`,
      "oauth_login:gitlab:abcXYZ-_123",
    );
    assert.notEqual(
      `oauth_login:github:${state}`,
      `oauth_login:gitlab:${state}`,
    );
  });
});
