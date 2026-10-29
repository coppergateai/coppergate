import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHIP_GATE_AUDIT_MIN_MS,
  shouldRecordShipGateAudit,
} from "./maintainer-tick.js";

describe("ship gate audit rate limit", () => {
  it("allows first write then suppresses until window elapses", () => {
    const projectId = `proj-${Date.now()}`;
    const t0 = 1_000_000;
    assert.equal(
      shouldRecordShipGateAudit(projectId, "default_branch_ci_red", t0),
      true,
    );
    assert.equal(
      shouldRecordShipGateAudit(projectId, "default_branch_ci_red", t0 + 1_000),
      false,
    );
    assert.equal(
      shouldRecordShipGateAudit(
        projectId,
        "default_branch_ci_pending",
        t0 + 1_000,
      ),
      true,
    );
    assert.equal(
      shouldRecordShipGateAudit(
        projectId,
        "default_branch_ci_red",
        t0 + SHIP_GATE_AUDIT_MIN_MS,
      ),
      true,
    );
  });
});
