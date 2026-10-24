import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveWorkspaceSignalSecret,
  resolveWorkspaceSignalSecret,
  verifySharedSecret,
} from "./verify.js";

describe("workspace-bound signal secrets", () => {
  it("derives distinct secrets per workspace", () => {
    const a = deriveWorkspaceSignalSecret("root-secret-value", "ws-a");
    const b = deriveWorkspaceSignalSecret("root-secret-value", "ws-b");
    assert.notEqual(a, b);
    assert.equal(a.length, 64);
    assert.equal(
      deriveWorkspaceSignalSecret("root-secret-value", "ws-a"),
      a,
    );
  });

  it("rejects root secret against derived workspace secret", () => {
    const derived = resolveWorkspaceSignalSecret({
      workspaceId: "ws-1",
      rootSecret: "root-secret-value",
    });
    assert.ok(derived);
    const withRoot = verifySharedSecret({
      headers: { "x-coppergate-signal-secret": "root-secret-value" },
      secret: derived,
    });
    assert.equal(withRoot.ok, false);
    const withDerived = verifySharedSecret({
      headers: { "x-coppergate-signal-secret": derived! },
      secret: derived,
    });
    assert.equal(withDerived.ok, true);
  });
});
