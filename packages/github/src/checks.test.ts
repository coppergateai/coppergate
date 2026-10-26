import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  commitCheckSuitesFailed,
  countOpenShipRollbackPrs,
  fetchCommitCheckEvidence,
  getRepoDefaultBranchHead,
  mapCheckRunPayload,
  mapCheckSuitePayload,
  mapCommitStatusPayload,
} from "./checks.js";

describe("CI check mapping", () => {
  it("marks success as passed and non-blocking", () => {
    const ev = mapCheckRunPayload({
      check_run: {
        id: 1,
        name: "build",
        status: "completed",
        conclusion: "success",
        head_sha: "abc",
      },
      repository: { full_name: "acme/app" },
    });
    assert.equal(ev.passed, true);
    assert.equal(ev.blocksAccept, false);
  });

  it("marks failure as blocking ACCEPTED", () => {
    const ev = mapCheckRunPayload({
      check_run: {
        id: 2,
        name: "test",
        status: "completed",
        conclusion: "failure",
        head_sha: "def",
      },
    });
    assert.equal(ev.passed, false);
    assert.equal(ev.blocksAccept, true);
  });

  it("maps check_suite timeout as blocking", () => {
    const ev = mapCheckSuitePayload({
      check_suite: {
        id: 9,
        status: "completed",
        conclusion: "timed_out",
        head_sha: "fff",
      },
    });
    assert.equal(ev.blocksAccept, true);
  });

  it("maps Vercel commit status success as passed", () => {
    const ev = mapCommitStatusPayload({
      state: "success",
      context: "Vercel",
      sha: "abc123",
      repository: { full_name: "acme/app" },
    });
    assert.equal(ev.passed, true);
    assert.equal(ev.blocksAccept, false);
    assert.equal(ev.headSha, "abc123");
  });

  it("polls check-runs and statuses for a sha", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/check-runs")) {
        return new Response(
          JSON.stringify({
            check_runs: [
              {
                id: 7,
                name: "Vercel Preview Comments",
                status: "completed",
                conclusion: "success",
                head_sha: "deadbeef",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/status")) {
        return new Response(
          JSON.stringify({
            state: "success",
            statuses: [
              { context: "Vercel", state: "success", target_url: "https://v" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("nope", { status: 404 });
    };
    const rows = await fetchCommitCheckEvidence({
      token: "t",
      owner: "acme",
      repo: "app",
      headSha: "deadbeef",
      fetchImpl,
    });
    assert.ok(rows.some((r) => r.name === "Vercel Preview Comments" && r.passed));
    assert.ok(rows.some((r) => r.name === "Vercel" && r.passed));
  });

  it("detects failed check suites on a commit", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          check_suites: [
            { status: "completed", conclusion: "failure" },
            { status: "completed", conclusion: "success" },
          ],
        }),
        { status: 200 },
      );
    assert.equal(
      await commitCheckSuitesFailed({
        token: "t",
        owner: "acme",
        repo: "app",
        sha: "abc",
        fetchImpl,
      }),
      true,
    );
  });

  it("reads default branch head sha", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/app")) {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        });
      }
      if (url.includes("/git/ref/heads/main")) {
        return new Response(
          JSON.stringify({ object: { sha: "deadbeef" } }),
          { status: 200 },
        );
      }
      return new Response("nope", { status: 404 });
    };
    const head = await getRepoDefaultBranchHead({
      token: "t",
      owner: "acme",
      repo: "app",
      fetchImpl,
    });
    assert.deepEqual(head, { defaultBranch: "main", sha: "deadbeef" });
  });

  it("counts open ship-rollback PRs via search", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      assert.match(String(input), /search\/issues/);
      return new Response(JSON.stringify({ total_count: 3 }), { status: 200 });
    };
    assert.equal(
      await countOpenShipRollbackPrs({
        token: "t",
        owner: "acme",
        repo: "app",
        fetchImpl,
      }),
      3,
    );
  });
});
