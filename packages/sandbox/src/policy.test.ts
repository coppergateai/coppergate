import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  METADATA_IPV4,
  SandboxPolicyError,
  assertEgressAllowed,
  assertNoDockerSocket,
  assertNotPrivileged,
  assertSafeServerFetchUrl,
  isEgressAllowed,
  isLinkLocalOrMetadata,
  isSafeServerFetchUrl,
} from "./policy.js";
import { buildDockerSandboxSpec } from "./docker-spec.js";

describe("sandbox policy", () => {
  it("blocks cloud metadata IP", () => {
    assert.equal(isLinkLocalOrMetadata(METADATA_IPV4), true);
    assert.equal(isEgressAllowed(METADATA_IPV4), false);
    assert.throws(
      () => assertEgressAllowed(METADATA_IPV4),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "egress_denied",
    );
  });

  it("allows GitHub / npm hosts", () => {
    assert.equal(isEgressAllowed("api.github.com"), true);
    assert.equal(isEgressAllowed("registry.npmjs.org"), true);
    assert.equal(isEgressAllowed("evil.example.com"), false);
    assert.equal(isEgressAllowed("10.0.0.5"), false);
  });

  it("forbids docker.sock mounts", () => {
    assert.throws(
      () => assertNoDockerSocket(["/var/run/docker.sock:/var/run/docker.sock"]),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "forbidden_mount",
    );
    assert.throws(
      () => assertNotPrivileged(true),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "privileged",
    );
  });

  it("buildDockerSandboxSpec never includes docker.sock and uses gVisor runtime", () => {
    const spec = buildDockerSandboxSpec({
      workdirHostPath: "/tmp/ws",
      baseSha: "abc123",
    });
    assert.equal(spec.runtime, "runsc");
    assert.equal(spec.privileged, false);
    assert.ok(spec.capDrop.includes("ALL"));
    assert.ok(!spec.mounts.some((m) => m.includes("docker.sock")));
    assert.throws(
      () =>
        buildDockerSandboxSpec({
          workdirHostPath: "/tmp/ws",
          baseSha: "abc",
          mounts: ["/var/run/docker.sock:/var/run/docker.sock"],
        }),
      (err: unknown) => err instanceof SandboxPolicyError,
    );
  });

  it("assertSafeServerFetchUrl blocks metadata and private hosts", () => {
    assert.throws(
      () => assertSafeServerFetchUrl(`http://${METADATA_IPV4}/latest`),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "egress_denied",
    );
    assert.equal(isSafeServerFetchUrl("https://10.0.0.5/hook"), false);
    assert.equal(isSafeServerFetchUrl("http://127.0.0.1:11434"), false);
    assert.ok(
      isSafeServerFetchUrl("http://127.0.0.1:11434/v1", {
        allowLoopback: true,
      }),
    );
    assert.ok(isSafeServerFetchUrl("https://hooks.slack.com/services/x"));
    assert.throws(
      () =>
        assertSafeServerFetchUrl("http://example.com/hook", {
          requireHttps: true,
        }),
      (err: unknown) =>
        err instanceof SandboxPolicyError && err.code === "invalid",
    );
  });
});
