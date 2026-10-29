import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyArchitectureFetchFailure,
  fetchArchitectureBacklogMarkdownResult,
} from "./architecture-program-fetch.js";

describe("architecture-program-fetch (AG-020)", () => {
  it("classifies bad_token over 404", () => {
    const f = classifyArchitectureFetchFailure({
      repo: "org/arch",
      paths: ["docs/OPEN_PROGRAM.md"],
      statuses: [404, 401],
      networkErrors: 0,
    });
    assert.equal(f.code, "bad_token");
  });

  it("classifies all-404 as not_found", () => {
    const f = classifyArchitectureFetchFailure({
      repo: "org/arch",
      paths: ["a.md", "b.md"],
      statuses: [404, 404],
      networkErrors: 0,
    });
    assert.equal(f.code, "not_found");
    assert.match(f.message, /re-bind/i);
  });

  it("fail-closed on 404 fetchImpl — no invent markdown", async () => {
    const result = await fetchArchitectureBacklogMarkdownResult({
      token: "x",
      repo: "org/arch",
      paths: "docs/OPEN_PROGRAM.md",
      fetchImpl: async () =>
        new Response("nope", { status: 404 }) as unknown as Response,
    });
    assert.equal(result.ok, false);
    assert.equal(result.markdown, "");
    assert.equal(result.failure?.code, "not_found");
  });

  it("fail-closed on 401", async () => {
    const result = await fetchArchitectureBacklogMarkdownResult({
      token: "bad",
      repo: "org/arch",
      paths: "docs/OPEN_PROGRAM.md",
      fetchImpl: async () =>
        new Response("denied", { status: 401 }) as unknown as Response,
    });
    assert.equal(result.ok, false);
    assert.equal(result.failure?.code, "bad_token");
  });

  it("ok when a path returns a file", async () => {
    const body = Buffer.from("| Open | AG-020 | x |", "utf8").toString(
      "base64",
    );
    const result = await fetchArchitectureBacklogMarkdownResult({
      token: "ok",
      repo: "org/arch",
      paths: "docs/OPEN_PROGRAM.md",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            type: "file",
            encoding: "base64",
            content: body,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ) as unknown as Response,
    });
    assert.equal(result.ok, true);
    assert.match(result.markdown, /AG-020/);
  });
});
