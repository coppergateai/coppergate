import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSecondaryRepoAllowed,
  resolveMultiRepoPolicy,
} from "./multi-repo.js";
import { evaluateIngestQuota } from "./signals.js";
import { SIGNAL_SLOS, isSloBurning } from "./slo.js";

describe("evaluateIngestQuota", () => {
  it("sheds provider storms", () => {
    const r = evaluateIngestQuota({
      workspaceCount: 10,
      providerCount: 60,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "provider_storm");
  });

  it("allows under limits", () => {
    const r = evaluateIngestQuota({ workspaceCount: 1, providerCount: 1 });
    assert.equal(r.ok, true);
  });
});

describe("multi-repo policy", () => {
  it("defaults off", () => {
    const p = resolveMultiRepoPolicy(null);
    assert.equal(p.enabled, false);
    const denied = assertSecondaryRepoAllowed(p, {
      secondaryCount: 1,
      filesTouched: 1,
    });
    assert.equal(denied.ok, false);
  });
});

describe("SLO burn", () => {
  it("ignores small samples", () => {
    assert.equal(
      isSloBurning({
        successCount: 1,
        totalCount: 5,
        targetRatio: SIGNAL_SLOS.ingestSuccessRatio,
      }),
      false,
    );
  });

  it("detects burn", () => {
    assert.equal(
      isSloBurning({
        successCount: 50,
        totalCount: 100,
        targetRatio: SIGNAL_SLOS.ingestSuccessRatio,
      }),
      true,
    );
  });
});
