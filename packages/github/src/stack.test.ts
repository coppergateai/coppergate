import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectGithubRepoStack } from "./stack.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("detectGithubRepoStack", () => {
  it("detects nextjs from package.json contents", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/contents/package.json")) {
        const content = Buffer.from(
          JSON.stringify({ dependencies: { next: "15.0.0" } }),
        ).toString("base64");
        return jsonResponse({
          type: "file",
          encoding: "base64",
          content,
        });
      }
      return jsonResponse({}, 404);
    };

    const result = await detectGithubRepoStack(
      "tok",
      "acme",
      "app",
      fetchImpl,
    );
    assert.equal(result.stack, "nextjs_ts");
    assert.equal(result.source, "files");
  });

  it("falls back to languages when no root markers", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/languages")) {
        return jsonResponse({ Go: 800, HTML: 20 });
      }
      if (url.includes("/git/trees/")) {
        return jsonResponse({ tree: [] });
      }
      if (init?.method === "HEAD") {
        return new Response(null, { status: 404 });
      }
      return jsonResponse({}, 404);
    };

    const result = await detectGithubRepoStack(
      "tok",
      "acme",
      "cli",
      fetchImpl,
    );
    assert.equal(result.stack, "go");
    assert.equal(result.source, "languages");
  });

  it("returns unknown when empty", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/languages")) {
        return jsonResponse({});
      }
      if (url.includes("/git/trees/")) {
        return jsonResponse({ tree: [] });
      }
      if (init?.method === "HEAD") {
        return new Response(null, { status: 404 });
      }
      return jsonResponse({}, 404);
    };

    const result = await detectGithubRepoStack(
      "tok",
      "acme",
      "empty",
      fetchImpl,
    );
    assert.equal(result.stack, "unknown");
  });
});
