import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSandboxExecTimeoutMs } from "./exec-timeout.js";
import { SandboxPolicyError } from "./policy.js";

describe("resolveSandboxExecTimeoutMs", () => {
  it("caps timeoutMs by hardDeadlineMs remaining", () => {
    const now = 1_000_000;
    const ms = resolveSandboxExecTimeoutMs(
      { timeoutMs: 60_000, hardDeadlineMs: now + 5_000 },
      now,
    );
    assert.equal(ms, 5_000);
  });

  it("throws when hard deadline already elapsed", () => {
    assert.throws(
      () =>
        resolveSandboxExecTimeoutMs(
          { timeoutMs: 60_000, hardDeadlineMs: 500 },
          1_000,
        ),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "timeout",
    );
  });
});
