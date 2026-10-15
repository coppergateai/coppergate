import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeGitlabDelivery, assertSafeBranch, GitlabDeliveryError } from "./delivery.js";

describe("FakeGitlabDelivery", () => {
  it("refuses default branch", async () => {
    const client = new FakeGitlabDelivery();
    await assert.rejects(
      () =>
        client.deliverPullRequest({
          repo: { owner: "acme", repo: "app", defaultBranch: "main" },
          branchName: "main",
          baseSha: "abc",
          commitMessage: "x",
          prTitle: "t",
          prBody: "b",
          files: [{ path: "a.ts", content: "1" }],
          idempotencyKey: "k1",
        }),
      (err: unknown) =>
        err instanceof GitlabDeliveryError && err.code === "policy",
    );
  });

  it("is idempotent on key", async () => {
    const client = new FakeGitlabDelivery();
    const input = {
      repo: { owner: "acme", repo: "app", defaultBranch: "main" },
      branchName: "coppergate/task-1",
      baseSha: "abc",
      commitMessage: "x",
      prTitle: "t",
      prBody: "b",
      files: [{ path: "a.ts", content: "1" }],
      idempotencyKey: "k1",
    };
    const a = await client.deliverPullRequest(input);
    const b = await client.deliverPullRequest(input);
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(a.prNumber, b.prNumber);
  });
});

describe("assertSafeBranch", () => {
  it("allows feature branches", () => {
    assertSafeBranch("feature/x", "main");
  });
});
