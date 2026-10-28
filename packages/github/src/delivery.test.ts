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

function mockGitDataDelivery(opts: {
  tipSha?: string;
  pulls?: () => Response;
  createRefStatus?: number;
  createPrStatus?: number;
  onCommit?: (body: unknown) => void;
  track?: { contentsPuts: number; commits: number; blobs: number };
}) {
  const tip = opts.tipSha ?? "basebasebase";
  const track = opts.track ?? { contentsPuts: 0, commits: 0, blobs: 0 };
  let pulls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (u.includes("/pulls?") && method === "GET") {
      if (opts.pulls) return opts.pulls();
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
      return new Response("{}", { status: opts.createRefStatus ?? 201 });
    }
    if (u.includes("/git/ref/heads/") && method === "GET") {
      return new Response(JSON.stringify({ object: { sha: tip } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/git/commits/") && method === "GET") {
      return new Response(
        JSON.stringify({ tree: { sha: "tree-base" }, sha: tip }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.endsWith("/git/blobs") && method === "POST") {
      track.blobs += 1;
      return new Response(
        JSON.stringify({ sha: `blob-${track.blobs}` }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.endsWith("/git/trees") && method === "POST") {
      return new Response(JSON.stringify({ sha: "tree-new" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.endsWith("/git/commits") && method === "POST") {
      track.commits += 1;
      if (opts.onCommit && init?.body) {
        opts.onCommit(JSON.parse(String(init.body)));
      }
      return new Response(JSON.stringify({ sha: "commit-one" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/git/refs/heads/") && method === "PATCH") {
      return new Response(JSON.stringify({ object: { sha: "commit-one" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/contents/") && method === "PUT") {
      track.contentsPuts += 1;
      return new Response(
        JSON.stringify({ commit: { sha: "should-not" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.endsWith("/pulls") && method === "POST") {
      if (opts.createPrStatus === 422) {
        return new Response("exists", { status: 422 });
      }
      return new Response(
        JSON.stringify({
          number: 7,
          html_url: "https://github.com/acme/app/pull/7",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected ${method} ${u}`);
  };
  return { fetchImpl, track };
}

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

  it("batches many files into a single git commit (no Contents PUT thrash)", async () => {
    const track = { contentsPuts: 0, commits: 0, blobs: 0 };
    let commitMessage = "";
    const { fetchImpl } = mockGitDataDelivery({
      tipSha: "basebasebase",
      track,
      onCommit: (body) => {
        commitMessage = (body as { message?: string }).message ?? "";
      },
    });
    const client = new HttpGithubDelivery("tok", fetchImpl);

    const result = await client.deliverPullRequest({
      repo: { owner: "acme", repo: "app", defaultBranch: "main" },
      branchName: "coppergate/task-batch",
      baseSha: "basebasebase",
      commitMessage: "Coppergate: batch me",
      prTitle: "Coppergate: batch me",
      prBody: "body",
      files: [
        { path: "a.ts", content: "a\n" },
        { path: "b.ts", content: "b\n" },
        { path: "c/d.ts", content: "c\n" },
      ],
      idempotencyKey: "k-batch",
    });

    assert.equal(result.created, true);
    assert.equal(result.headSha, "commit-one");
    assert.equal(track.commits, 1);
    assert.equal(track.blobs, 3);
    assert.equal(track.contentsPuts, 0);
    assert.equal(commitMessage, "Coppergate: batch me");
  });

  it("recovers createPr 422 by re-finding existing PR", async () => {
    let listCalls = 0;
    const { fetchImpl } = mockGitDataDelivery({
      tipSha: "abc",
      createRefStatus: 422,
      createPrStatus: 422,
      pulls: () => {
        listCalls += 1;
        if (listCalls === 1) {
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
      },
    });
    const client = new HttpGithubDelivery("tok", fetchImpl);

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

  it("refuses commit when branch head moved (CAS)", async () => {
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
