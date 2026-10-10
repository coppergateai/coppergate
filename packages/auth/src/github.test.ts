import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { githubAuthorizeUrl } from "./github.js";

describe("githubAuthorizeUrl", () => {
  it("builds authorize URL with identity scopes", () => {
    const url = githubAuthorizeUrl(
      {
        clientId: "cid",
        clientSecret: "sec",
        redirectUri: "http://localhost:3000/api/auth/github/callback",
      },
      "state-1",
    );
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://github.com");
    assert.equal(parsed.searchParams.get("client_id"), "cid");
    assert.equal(parsed.searchParams.get("state"), "state-1");
    assert.equal(parsed.searchParams.get("scope"), "read:user user:email");
  });
});
