import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSandboxCommandArgs } from "./command-policy.js";
import { SandboxPolicyError } from "./policy.js";

describe("assertSandboxCommandArgs", () => {
  it("blocks bare private IP args", () => {
    assert.throws(
      () => assertSandboxCommandArgs(["curl", "10.0.0.5"]),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "egress_denied",
    );
    assert.throws(
      () => assertSandboxCommandArgs(["wget", "http://192.168.1.1/x"]),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "egress_denied",
    );
  });

  it("allows normal local commands", () => {
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["npm", "test", "--", "app/page.tsx"]),
    );
  });
});
