import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SANDBOX_LOCAL_FORBIDDEN_CODE,
  evaluateSandboxModePolicy,
  resolveSandboxMode,
} from "./sandbox-mode.js";

describe("resolveSandboxMode", () => {
  it("defaults to local and maps aliases", () => {
    assert.equal(resolveSandboxMode({}), "local");
    assert.equal(resolveSandboxMode({ SANDBOX_MODE: " Docker " }), "docker");
    assert.equal(resolveSandboxMode({ SANDBOX_MODE: "gvisor" }), "docker");
    assert.equal(resolveSandboxMode({ SANDBOX_MODE: "off" }), "off");
  });
});

describe("evaluateSandboxModePolicy (SEC-037)", () => {
  it("refuses local in production without ack", () => {
    const policy = evaluateSandboxModePolicy({ NODE_ENV: "production" });
    assert.equal(policy.allowed, false);
    assert.equal(
      !policy.allowed && policy.errorCode,
      SANDBOX_LOCAL_FORBIDDEN_CODE,
    );
  });

  it("refuses unknown modes in production (they resolve to local)", () => {
    const policy = evaluateSandboxModePolicy({
      NODE_ENV: "production",
      SANDBOX_MODE: "dokcer",
    });
    assert.equal(policy.allowed, false);
  });

  it("only the exact ack value permits local in production", () => {
    for (const ack of ["true", "yes", "0", ""]) {
      const policy = evaluateSandboxModePolicy({
        NODE_ENV: "production",
        ALLOW_LOCAL_SANDBOX: ack,
      });
      assert.equal(policy.allowed, false, `ack=${ack}`);
    }
    const ok = evaluateSandboxModePolicy({
      NODE_ENV: "production",
      ALLOW_LOCAL_SANDBOX: "1",
    });
    assert.deepEqual(ok, { mode: "local", allowed: true, breakGlass: true });
  });

  it("allows docker and off in production, local outside production", () => {
    assert.equal(
      evaluateSandboxModePolicy({ NODE_ENV: "production", SANDBOX_MODE: "docker" })
        .allowed,
      true,
    );
    assert.equal(
      evaluateSandboxModePolicy({ NODE_ENV: "production", SANDBOX_MODE: "off" })
        .allowed,
      true,
    );
    assert.equal(evaluateSandboxModePolicy({ NODE_ENV: "development" }).allowed, true);
    assert.equal(evaluateSandboxModePolicy({ NODE_ENV: "test" }).allowed, true);
  });
});
