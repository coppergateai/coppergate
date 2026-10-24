import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNED_WORKSPACE_STATE_TTL_SEC,
  createSignedWorkspaceState,
  verifySignedWorkspaceState,
  verifySignedWorkspaceStateClaims,
} from "./signed-workspace-state";

describe("signed workspace state", () => {
  const secret = "test-session-secret-at-least-32-chars!!";
  const workspaceId = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";

  it("round-trips claims", () => {
    const now = 1_700_000_000_000;
    const state = createSignedWorkspaceState(workspaceId, secret, now);
    const claims = verifySignedWorkspaceStateClaims(state, secret, now);
    assert.ok(claims);
    assert.equal(claims!.workspaceId, workspaceId);
    assert.equal(
      claims!.exp,
      Math.floor(now / 1000) + SIGNED_WORKSPACE_STATE_TTL_SEC,
    );
  });

  it("rejects expired and tampered state", () => {
    const issued = 1_700_000_000_000;
    const state = createSignedWorkspaceState(workspaceId, secret, issued);
    assert.equal(
      verifySignedWorkspaceState(
        state,
        secret,
        issued + (SIGNED_WORKSPACE_STATE_TTL_SEC + 1) * 1000,
      ),
      null,
    );
    const parts = state.split(".");
    parts[0] = "00000000-0000-0000-0000-000000000000";
    assert.equal(verifySignedWorkspaceState(parts.join("."), secret), null);
  });
});
