import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LLM_VENDOR,
  extractOpenAiModelIds,
  getLlmProvider,
  inferLlmVendor,
  isLlmVendorId,
  normalizeLlmBaseUrl,
  resolveLlmApiKeyToSeal,
} from "./llm-providers.js";

describe("llm-providers", () => {
  it("recognizes vendor ids", () => {
    assert.equal(isLlmVendorId("openai"), true);
    assert.equal(isLlmVendorId("cursor"), true);
    assert.equal(isLlmVendorId("claude_code"), true);
    assert.equal(isLlmVendorId("ollama"), true);
    assert.equal(isLlmVendorId("default"), false);
  });

  it("infers vendor from label first", () => {
    assert.equal(
      inferLlmVendor({ label: "groq", baseUrl: "https://api.openai.com/v1" }),
      "groq",
    );
  });

  it("infers vendor from baseUrl when label is legacy", () => {
    assert.equal(
      inferLlmVendor({
        label: "default",
        baseUrl: "http://127.0.0.1:11434/v1",
      }),
      "ollama",
    );
    assert.equal(
      inferLlmVendor({
        label: "default",
        baseUrl: "https://example.com/v1/",
      }),
      "custom",
    );
  });

  it("defaults unknown empty credential to openai", () => {
    assert.equal(inferLlmVendor({}), DEFAULT_LLM_VENDOR);
  });

  it("seals sentinel for local vendors without key", () => {
    assert.equal(resolveLlmApiKeyToSeal("ollama", ""), "ollama");
    assert.equal(resolveLlmApiKeyToSeal("lmstudio", "  "), "lmstudio");
    assert.equal(resolveLlmApiKeyToSeal("ollama", "sk-real"), "sk-real");
    assert.equal(resolveLlmApiKeyToSeal("openai", ""), null);
    assert.equal(resolveLlmApiKeyToSeal("custom", null), null);
  });

  it("normalizes base URLs from presets", () => {
    assert.equal(
      normalizeLlmBaseUrl("openai", "https://evil.example/v1"),
      "https://api.openai.com/v1",
    );
    assert.equal(
      normalizeLlmBaseUrl("ollama", "http://10.0.0.5:11434/v1/"),
      "http://10.0.0.5:11434/v1",
    );
    assert.equal(normalizeLlmBaseUrl("ollama", ""), "http://127.0.0.1:11434/v1");
    assert.equal(normalizeLlmBaseUrl("custom", "  "), null);
    assert.equal(normalizeLlmBaseUrl("cursor", "https://evil.example/v1"), null);
    assert.equal(
      normalizeLlmBaseUrl("claude_code", "https://evil.example/v1"),
      null,
    );
  });

  it("cursor preset requires key and hides base URL", () => {
    const p = getLlmProvider("cursor")!;
    assert.equal(p.hideBaseUrl, true);
    assert.equal(p.requiresKey, true);
    assert.ok(p.curatedModels.includes("composer-2.5"));
  });

  it("claude_code preset requires key and hides base URL", () => {
    const p = getLlmProvider("claude_code")!;
    assert.equal(p.hideBaseUrl, true);
    assert.equal(p.requiresKey, true);
    assert.ok(p.curatedModels.includes("claude-sonnet-4-5"));
  });

  it("openai preset hides base and requires key", () => {
    const p = getLlmProvider("openai")!;
    assert.equal(p.hideBaseUrl, true);
    assert.equal(p.requiresKey, true);
    assert.ok(p.curatedModels.includes("gpt-4o-mini"));
  });

  it("extracts unique sorted model ids from OpenAI payloads", () => {
    assert.deepEqual(
      extractOpenAiModelIds({
        data: [{ id: "llama3.2" }, { id: "codellama" }, { id: "llama3.2" }],
      }),
      ["codellama", "llama3.2"],
    );
    assert.deepEqual(extractOpenAiModelIds(null), []);
    assert.deepEqual(extractOpenAiModelIds({ data: "nope" }), []);
  });
});
