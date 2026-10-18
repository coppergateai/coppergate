import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestLlmConnectionLabel } from "./credentials.js";

describe("suggestLlmConnectionLabel", () => {
  it("builds slug from vendor + model", () => {
    assert.equal(
      suggestLlmConnectionLabel("openai", "gpt-4o-mini"),
      "openai-gpt-4o-mini",
    );
    assert.equal(
      suggestLlmConnectionLabel("openai", "openai/gpt-4o"),
      "openai-openai-gpt-4o",
    );
  });

  it("falls back when model missing", () => {
    assert.equal(suggestLlmConnectionLabel("ollama", null), "ollama-default");
    assert.equal(suggestLlmConnectionLabel("groq", "  "), "groq-default");
  });
});
