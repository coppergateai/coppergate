import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInstallState, verifyInstallState } from "./github-install";

describe("install state", () => {
  const secret = "test-session-secret-at-least-32-chars!!";
  const workspaceId = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";

  it("round-trips workspace id", () => {
    const state = createInstallState(workspaceId, secret);
    assert.equal(verifyInstallState(state, secret), workspaceId);
  });

  it("rejects tampered workspace id", () => {
    const state = createInstallState(workspaceId, secret);
    const parts = state.split(".");
    parts[0] = "00000000-0000-0000-0000-000000000000";
    assert.equal(verifyInstallState(parts.join("."), secret), null);
  });

  it("rejects unsigned legacy state", () => {
    assert.equal(
      verifyInstallState(`${workspaceId}.YxMtfI61c6D_62k5zQmoTw`, secret),
      null,
    );
  });

  it("rejects wrong secret", () => {
    const state = createInstallState(workspaceId, secret);
    assert.equal(verifyInstallState(state, "other-secret-at-least-32-chars!!!!"), null);
  });
});
