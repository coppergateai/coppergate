import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  llmUsageProviderRoleFromMeta,
  llmUsageRolesDedupe,
} from "./llm-usage-meta.js";

describe("llm-usage-meta", () => {
  it("parses providerRole and dedupe roles", () => {
    assert.equal(
      llmUsageProviderRoleFromMeta({ providerRole: "fallback" }),
      "fallback",
    );
    assert.equal(llmUsageProviderRoleFromMeta(null), "legacy");
    assert.equal(llmUsageRolesDedupe("legacy", "legacy"), true);
    assert.equal(llmUsageRolesDedupe("primary", "primary"), true);
    assert.equal(llmUsageRolesDedupe("primary", "fallback"), false);
    assert.equal(llmUsageRolesDedupe("legacy", "primary"), false);
  });
});
