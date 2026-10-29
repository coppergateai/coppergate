import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  describeArchitectureFetchFailure,
  fetchArchitectureProgram,
} from "./architecture-program-fetch.js";

describe("architecture-program-fetch (AG-020)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("fetchArchitectureProgram fail-closed on 401 (bad token)", async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    const result = await fetchArchitectureProgram({
      token: "ghp_dead",
      repo: "coppergateai/coppergate-architecture",
      paths: "docs/OPEN_PROGRAM.md",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "bad_token");
    assert.match(
      describeArchitectureFetchFailure(result),
      /re-bind the Program path/i,
    );
  });

  it("fetchArchitectureProgram fail-closed when all paths 404", async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
      });
    }) as typeof fetch;

    const result = await fetchArchitectureProgram({
      token: "ghs_ok",
      repo: "coppergateai/coppergate-architecture",
      paths: "docs/OPEN_PROGRAM.md",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "program_not_found");
    assert.match(
      describeArchitectureFetchFailure(result),
      /Re-bind architectureRepo and Program path/i,
    );
  });

  it("fetchArchitectureProgram joins successful path chunks", async () => {
    const body = {
      type: "file",
      encoding: "base64",
      content: Buffer.from("| Open | AG-020 | Test |", "utf8").toString(
        "base64",
      ),
    };
    globalThis.fetch = mock.fn(async () => {
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    const result = await fetchArchitectureProgram({
      token: "ghs_ok",
      repo: "coppergateai/coppergate-architecture",
      paths: "docs/OPEN_PROGRAM.md",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.markdown, /AG-020/);
    assert.match(result.markdown, /OPEN_PROGRAM/);
  });
});
