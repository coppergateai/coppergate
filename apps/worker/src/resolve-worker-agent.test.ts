import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldRefuseEnvLlmWhenWorkspaceByokPresent } from "./resolve-worker-agent.js";

describe("resolveWorkerAgent env LLM policy (AG-013)", () => {
  it("refuses env LLM in production when workspace BYOK exists", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_ENV_LLM_KEYS;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_ENV_LLM_KEYS;
    try {
      assert.equal(shouldRefuseEnvLlmWhenWorkspaceByokPresent(true), true);
      assert.equal(shouldRefuseEnvLlmWhenWorkspaceByokPresent(false), false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevAllow === undefined) delete process.env.ALLOW_ENV_LLM_KEYS;
      else process.env.ALLOW_ENV_LLM_KEYS = prevAllow;
    }
  });

  it("allows env LLM for single-tenant self-host opt-in", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_ENV_LLM_KEYS;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_ENV_LLM_KEYS = "1";
    try {
      assert.equal(shouldRefuseEnvLlmWhenWorkspaceByokPresent(true), false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevAllow === undefined) delete process.env.ALLOW_ENV_LLM_KEYS;
      else process.env.ALLOW_ENV_LLM_KEYS = prevAllow;
    }
  });
});
