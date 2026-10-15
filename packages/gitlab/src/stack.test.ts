import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectGitlabProjectStack } from "./stack.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("detectGitlabProjectStack", () => {
  it("detects ruby from Gemfile", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("repository/files/Gemfile")) {
        return jsonResponse({
          encoding: "base64",
          content: Buffer.from("source 'https://rubygems.org'\n").toString(
            "base64",
          ),
        });
      }
      return jsonResponse({}, 404);
    };

    const result = await detectGitlabProjectStack(
      "tok",
      "https://gitlab.com",
      42,
      fetchImpl,
    );
    assert.equal(result.stack, "ruby");
    assert.equal(result.source, "files");
  });

  it("uses languages API when no files", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/languages")) {
        return jsonResponse({ Python: 90.5, Shell: 9.5 });
      }
      if (url.includes("/repository/tree")) {
        return jsonResponse([]);
      }
      return jsonResponse({}, 404);
    };

    const result = await detectGitlabProjectStack(
      "tok",
      "https://gitlab.example.com",
      "group%2Fproj",
      fetchImpl,
    );
    assert.equal(result.stack, "python");
    assert.equal(result.source, "languages");
  });
});
