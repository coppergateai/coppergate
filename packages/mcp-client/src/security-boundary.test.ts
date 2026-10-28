import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeMcpServerEndpoint,
  filterPermittedMcpTools,
  sanitizeMcpToolResult,
  scrubToolSummary,
} from "./security-boundary.js";

describe("@coppergate/mcp-client security boundary", () => {
  it("requires https for remote hosts", () => {
    assert.deepEqual(
      assertSafeMcpServerEndpoint("http://tools.example.com/mcp"),
      { ok: false, reason: "https_required_for_remote" },
    );
    assert.deepEqual(
      assertSafeMcpServerEndpoint("https://tools.example.com/mcp"),
      { ok: true },
    );
  });

  it("blocks private and metadata hosts", () => {
    assert.equal(assertSafeMcpServerEndpoint("https://10.0.0.5/mcp").ok, false);
    assert.equal(
      assertSafeMcpServerEndpoint("https://169.254.169.254/mcp").ok,
      false,
    );
  });

  it("allows localhost only when opted in", () => {
    assert.equal(
      assertSafeMcpServerEndpoint("http://127.0.0.1:3001/mcp").ok,
      false,
    );
    assert.deepEqual(
      assertSafeMcpServerEndpoint("http://127.0.0.1:3001/mcp", {
        allowLocalhost: true,
      }),
      { ok: true },
    );
  });

  it("filters permitted tools and sanitizes results", () => {
    const tools = filterPermittedMcpTools(
      [{ name: "a" }, { name: "b" }],
      ["a"],
    );
    assert.deepEqual(
      tools.map((t) => t.name),
      ["a"],
    );
    assert.deepEqual(
      sanitizeMcpToolResult({
        ok: true,
        accessToken: "secret",
        data: 1,
      }),
      { ok: true, data: 1 },
    );
  });

  it("scrubs credential-like summaries", () => {
    assert.match(
      scrubToolSummary("Authorization: Bearer abc.def token=xyz"),
      /redacted/i,
    );
  });
});
