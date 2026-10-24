import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FakeGithubDelivery,
  GithubDeliveryError,
  HttpGithubDelivery,
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

describe("HttpGithubDelivery reliability", () => {
  it("fails closed when list pulls is non-ok", async () => {
    const client = new HttpGithubDelivery("tok", async (url) => {
      if (String(url).includes("/pulls?")) {
        return new Response("nope", { status: 500 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    await assert.rejects(
      () =>
        client.deliverPullRequest({
          repo: { owner: "acme", repo: "app", defaultBranch: "main" },
          branchName: "coppergate/task-1",
          baseSha: "abc",
          commitMessage: "x",
          prTitle: "t",
          prBody: "b",
          files: [{ path: "a.ts", content: "1\n" }],
          idempotencyKey: "k1",
        }),
      (err: unknown) =>
        err instanceof GithubDeliveryError &&
        err.message.includes("findPrByHead failed"),
    );
  });

  it("recovers createPr 422 by re-finding existing PR", async () => {
    let pulls = 0;
    const client = new HttpGithubDelivery("tok", async (url, init) => {
      const u = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      if (u.includes("/pulls?") && method === "GET") {
        pulls += 1;
        if (pulls === 1) {
          return new Response("[]", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify([
            {
              number: 42,
              html_url: "https://github.com/acme/app/pull/42",
              head: { sha: "deadbeef", ref: "coppergate/task-1" },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.endsWith("/git/refs") && method === "POST") {
        return new Response("{}", { status: 422 });
      }
      if (u.includes("/git/ref/heads/") && method === "GET") {
        return new Response(
          JSON.stringify({ object: { sha: "abc" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/contents/") && method === "GET") {
        return new Response("{}", { status: 404 });
      }
      if (u.includes("/contents/") && method === "PUT") {
        return new Response(
          JSON.stringify({ commit: { sha: "cafebabe" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.endsWith("/pulls") && method === "POST") {
        return new Response("exists", { status: 422 });
      }
      throw new Error(`unexpected ${method} ${u}`);
    });

    const result = await client.deliverPullRequest({
      repo: { owner: "acme", repo: "app", defaultBranch: "main" },
      branchName: "coppergate/task-1",
      baseSha: "abc",
      commitMessage: "x",
      prTitle: "t",
      prBody: "b",
      files: [{ path: "a.ts", content: "1\n" }],
      idempotencyKey: "k2",
    });
    assert.equal(result.created, false);
    assert.equal(result.prNumber, 42);
  });

  it("refuses putFile when branch head moved (CAS)", async () => {
    const client = new HttpGithubDelivery("tok", async (url, init) => {
      const u = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      if (u.includes("/pulls?") && method === "GET") {
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.endsWith("/git/refs") && method === "POST") {
        return new Response("{}", { status: 201 });
      }
      if (u.includes("/git/ref/heads/") && method === "GET") {
        return new Response(
          JSON.stringify({ object: { sha: "otherworker" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected ${method} ${u}`);
    });

    await assert.rejects(
      () =>
        client.deliverPullRequest({
          repo: { owner: "acme", repo: "app", defaultBranch: "main" },
          branchName: "coppergate/task-cas",
          baseSha: "basebasebase",
          commitMessage: "x",
          prTitle: "t",
          prBody: "b",
          files: [{ path: "a.ts", content: "1\n" }],
          idempotencyKey: "k-cas",
        }),
      (err: unknown) =>
        err instanceof GithubDeliveryError &&
        err.code === "conflict" &&
        err.message.includes("branch head moved"),
    );
  });
});
