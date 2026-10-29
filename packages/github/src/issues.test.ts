import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergePullRequest } from "./issues.js";

describe("mergePullRequest SEC-036", () => {
  it("refuses merge without allowDefaultBranchWrite before HTTP", async () => {
    let called = false;
    const result = await mergePullRequest({
      token: "t",
      owner: "o",
      repo: "r",
      prNumber: 1,
      allowDefaultBranchWrite: false,
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(called, false);
    assert.equal(result.merged, false);
    assert.match(result.message, /explicit policy flag/i);
  });

  it("calls GitHub merge API when policy flag is set", async () => {
    let method = "";
    const result = await mergePullRequest({
      token: "t",
      owner: "o",
      repo: "r",
      prNumber: 2,
      allowDefaultBranchWrite: true,
      fetchImpl: async (_url, init) => {
        method = init?.method ?? "";
        return new Response(
          JSON.stringify({ merged: true, sha: "abc", message: "merged" }),
          { status: 200 },
        );
      },
    });
    assert.equal(method, "PUT");
    assert.equal(result.merged, true);
    assert.equal(result.sha, "abc");
  });
});
