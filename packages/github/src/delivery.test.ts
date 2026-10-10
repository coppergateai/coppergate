import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FakeGithubDelivery,
  GithubDeliveryError,
  assertSafeBranch,
} from "./delivery.js";

describe("GitHub PR delivery", () => {
  it("refuses default branch pushes", () => {
    assert.throws(
      () => assertSafeBranch("main", "main"),
      (err: unknown) =>
        err instanceof GithubDeliveryError && err.code === "policy",
    );
    assert.throws(
      () => assertSafeBranch("master", "master"),
      (err: unknown) => err instanceof GithubDeliveryError,
    );
  });

  it("fake delivery opens PR on feature branch and is idempotent", async () => {
    const client = new FakeGithubDelivery();
    const input = {
      repo: { owner: "acme", repo: "app", defaultBranch: "main" },
      branchName: "coppergate/task-abc",
      baseSha: "basebasebase",
      commitMessage: "feat: fixture change",
      prTitle: "Coppergate: fixture",
      prBody: "Task linked run",
      files: [{ path: "README.md", content: "# hi\n" }],
      idempotencyKey: "acme/app:coppergate/task-abc:1",
    };

    const first = await client.deliverPullRequest(input);
    assert.equal(first.created, true);
    assert.ok(first.prNumber > 0);
    assert.ok(first.prUrl.includes("/pull/"));
    assert.equal(first.branchName, "coppergate/task-abc");
    assert.notEqual(first.branchName, "main");

    const second = await client.deliverPullRequest(input);
    assert.equal(second.created, false);
    assert.equal(second.prNumber, first.prNumber);
    assert.equal(client.pushes.length, 1);
    assert.ok(client.pushes.every((p) => p.branch !== "main"));
  });

  it("fake delivery rejects branch equal to default", async () => {
    const client = new FakeGithubDelivery();
    await assert.rejects(
      () =>
        client.deliverPullRequest({
          repo: { owner: "acme", repo: "app", defaultBranch: "main" },
          branchName: "main",
          baseSha: "abc",
          commitMessage: "nope",
          prTitle: "nope",
          prBody: "",
          files: [{ path: "x", content: "y" }],
          idempotencyKey: "k",
        }),
      (err: unknown) =>
        err instanceof GithubDeliveryError && err.code === "policy",
    );
    assert.equal(client.pushes.length, 0);
  });
});
