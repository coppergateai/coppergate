import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listOpenPulls, submitPullRequestReview } from "./pulls.js";

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
