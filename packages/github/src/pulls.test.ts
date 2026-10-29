import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getPullRequestMergeState,
  listOpenPulls,
  submitPullRequestReview,
  updatePullRequestBranch,
} from "./pulls.js";

describe("listOpenPulls", () => {
  it("maps open pull payloads", async () => {
    const pulls = await listOpenPulls({
      token: "t",
      owner: "acme",
      repo: "app",
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              number: 42,
              title: "Fix auth",
              body: "details",
              html_url: "https://github.com/acme/app/pull/42",
              state: "open",
              head: { ref: "fix-auth" },
              base: { ref: "main" },
            },
          ]),
          { status: 200 },
        ),
    });
    assert.equal(pulls.length, 1);
    assert.equal(pulls[0]!.number, 42);
    assert.equal(pulls[0]!.headRef, "fix-auth");
    assert.equal(pulls[0]!.baseRef, "main");
  });
});

describe("getPullRequestMergeState", () => {
  it("maps mergeable + mergeable_state for conflict heal", async () => {
    const state = await getPullRequestMergeState({
      token: "t",
      owner: "acme",
      repo: "app",
      prNumber: 190,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            number: 190,
            state: "open",
            merged: false,
            mergeable: false,
            mergeable_state: "dirty",
            head: { ref: "coppergate/ag-018", sha: "abc123" },
            base: { ref: "main" },
          }),
          { status: 200 },
        ),
    });
    assert.equal(state.number, 190);
    assert.equal(state.mergeable, false);
    assert.equal(state.mergeableState, "dirty");
    assert.equal(state.headRef, "coppergate/ag-018");
    assert.equal(state.headSha, "abc123");
    assert.equal(state.baseRef, "main");
  });
});

describe("updatePullRequestBranch (AG-036)", () => {
  it("maps 202 as updated", async () => {
    const result = await updatePullRequestBranch({
      token: "t",
      owner: "acme",
      repo: "app",
      prNumber: 9,
      expectedHeadSha: "abc",
      fetchImpl: async (_url, init) => {
        assert.equal(init?.method, "PUT");
        const body = JSON.parse(String(init?.body)) as {
          expected_head_sha?: string;
        };
        assert.equal(body.expected_head_sha, "abc");
        return new Response(JSON.stringify({ message: "Updating" }), {
          status: 202,
        });
      },
    });
    assert.equal(result.updated, true);
    assert.equal(result.conflict, false);
  });

  it("maps 422 conflict", async () => {
    const result = await updatePullRequestBranch({
      token: "t",
      owner: "acme",
      repo: "app",
      prNumber: 9,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ message: "merge conflict between base and head" }),
          { status: 422 },
        ),
    });
    assert.equal(result.updated, false);
    assert.equal(result.conflict, true);
  });
});

describe("submitPullRequestReview", () => {
  it("POSTs COMMENT event", async () => {
    let called = false;
    const result = await submitPullRequestReview({
      token: "t",
      owner: "acme",
      repo: "app",
      prNumber: 7,
      body: "## review",
      event: "COMMENT",
      fetchImpl: async (_url, init) => {
        called = true;
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init?.body)) as {
          event: string;
          body: string;
        };
        assert.equal(body.event, "COMMENT");
        assert.equal(body.body, "## review");
        return new Response(JSON.stringify({ id: 99 }), { status: 200 });
      },
    });
    assert.equal(called, true);
    assert.equal(result.id, 99);
  });
});
