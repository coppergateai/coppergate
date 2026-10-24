import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INSTALL_STATE_TTL_SEC,
  createInstallState,
  verifyInstallState,
  verifyInstallStateClaims,
} from "./github-install";

describe("install state", () => {
  const secret = "test-session-secret-at-least-32-chars!!";
  const workspaceId = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";

  it("round-trips workspace id with exp + nonce", () => {
    const now = 1_700_000_000_000;
    const state = createInstallState(workspaceId, secret, now);
    const claims = verifyInstallStateClaims(state, secret, now);
    assert.ok(claims);
    assert.equal(claims!.workspaceId, workspaceId);
    assert.equal(claims!.exp, Math.floor(now / 1000) + INSTALL_STATE_TTL_SEC);
    assert.ok(claims!.nonce.length > 10);
    assert.equal(verifyInstallState(state, secret, now), workspaceId);
  });

  it("rejects tampered workspace id", () => {
    const state = createInstallState(workspaceId, secret);
    const parts = state.split(".");
    parts[0] = "00000000-0000-0000-0000-000000000000";
    assert.equal(verifyInstallState(parts.join("."), secret), null);
  });

  it("rejects unsigned legacy 3-part state", () => {
    assert.equal(
      verifyInstallState(`${workspaceId}.YxMtfI61c6D_62k5zQmoTw.mac`, secret),
      null,
    );
  });

  it("rejects expired state", () => {
    const issued = 1_700_000_000_000;
    const state = createInstallState(workspaceId, secret, issued);
    const afterTtl = issued + (INSTALL_STATE_TTL_SEC + 1) * 1000;
    assert.equal(verifyInstallState(state, secret, afterTtl), null);
  });

  it("rejects wrong secret", () => {
    const state = createInstallState(workspaceId, secret);
    assert.equal(
      verifyInstallState(state, "other-secret-at-least-32-chars!!!!"),
      null,
    );
  });
});
