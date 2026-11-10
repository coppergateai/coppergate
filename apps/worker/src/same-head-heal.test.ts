import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkRunIdFromDetailsUrl,
  fetchFailingCheckOutput,
} from "./same-head-heal.js";

describe("same-head heal check output", () => {
  it("parses check run ids from Actions job and check URLs", () => {
    assert.equal(
      checkRunIdFromDetailsUrl(
        "https://github.com/o/r/actions/runs/40883891101/job/1234567",
      ),
      1234567,
    );
    assert.equal(
      checkRunIdFromDetailsUrl("https://github.com/o/r/runs/987?check_suite_focus=true"),
      987,
    );
    assert.equal(checkRunIdFromDetailsUrl("https://vercel.com/o/r/abc"), null);
    assert.equal(checkRunIdFromDetailsUrl(null), null);
  });

  it("collects annotation snippets for failing checks, best-effort", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(
        JSON.stringify([
          {
            title: "no-unused-vars",
            message: "'LEAN_ROSTER_AVAILABLE_MICROS' is defined but never used",
            path: "packages/db/src/maintainer.test.ts",
          },
        ]),
      );
    }) as typeof fetch;
    const out = await fetchFailingCheckOutput({
      token: "t",
      owner: "o",
      repo: "r",
      checks: [
        { name: "check", conclusion: "failure", detailsUrl: "https://github.com/o/r/actions/runs/1/job/42" },
        { name: "vercel", conclusion: "failure", detailsUrl: "https://vercel.com/x" },
      ],
      fetchImpl,
    });
    assert.deepEqual(seen, [
      "https://api.github.com/repos/o/r/check-runs/42/annotations?per_page=30",
    ]);
    assert.match(out ?? "", /\[check\][\s\S]*LEAN_ROSTER_AVAILABLE_MICROS/);
  });
});
