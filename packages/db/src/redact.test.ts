import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsSecretMaterial,
  redactPayload,
  redactString,
} from "./redact.js";

describe("secret redaction", () => {
  it("redacts GitHub and bearer tokens in strings", () => {
    const raw =
      "auth ghp_abcdefghijklmnopqrstuvwxyz012345 and Bearer abcdefghijklmnop";
    const out = redactString(raw);
    assert.equal(containsSecretMaterial(out), false);
    assert.ok(out.includes("[REDACTED]"));
    assert.ok(!out.includes("ghp_"));
  });

  it("redacts sensitive object keys", () => {
    const out = redactPayload({
      message: "ok",
      authorization: "Bearer supersecretvalue123",
      nested: { api_key: "sk-abcdefghijklmnopqrstuvwxyz", path: "app/page.tsx" },
    });
    assert.equal(out.authorization, "[REDACTED]");
    const nested = out.nested as Record<string, unknown>;
    assert.equal(nested.api_key, "[REDACTED]");
    assert.equal(nested.path, "app/page.tsx");
  });

  it("detects uncleared secret material", () => {
    assert.equal(
      containsSecretMaterial("ghp_abcdefghijklmnopqrstuvwxyz012345"),
      true,
    );
    assert.equal(containsSecretMaterial("plain log line"), false);
  });
});
