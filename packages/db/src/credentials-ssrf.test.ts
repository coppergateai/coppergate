import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SandboxPolicyError,
  assertSafeServerFetchUrlResolved,
} from "@coppergate/sandbox/policy";

/**
 * Contract for LLM BYOK baseUrl SSRF policy (createLlmByok / updateLlmByok).
 * Loopback allowed for Ollama; metadata / private LAN blocked.
 */
describe("llm byok baseUrl SSRF contract", () => {
  it("allows public https endpoints", async () => {
    const url = await assertSafeServerFetchUrlResolved(
      "https://api.openai.com/v1",
      { allowLoopback: true },
    );
    assert.equal(url.hostname, "api.openai.com");
  });

  it("allows loopback for local models", async () => {
    const url = await assertSafeServerFetchUrlResolved(
      "http://127.0.0.1:11434/v1",
      { allowLoopback: true },
    );
    assert.equal(url.hostname, "127.0.0.1");
  });

  it("blocks cloud metadata", async () => {
    await assert.rejects(
      () =>
        assertSafeServerFetchUrlResolved("http://169.254.169.254/latest", {
          allowLoopback: true,
        }),
      (err: unknown) => err instanceof SandboxPolicyError,
    );
  });

  it("blocks private LAN without allowPrivate", async () => {
    await assert.rejects(
      () =>
        assertSafeServerFetchUrlResolved("http://10.0.0.5/v1", {
          allowLoopback: true,
        }),
      (err: unknown) => err instanceof SandboxPolicyError,
    );
  });
});
