import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIGNAL_SLOS, evaluateSloBurn } from "./slos.js";

describe("SIGNAL_SLOS burn", () => {
  it("passes when within targets", () => {
    const r = evaluateSloBurn({
      ingestSuccessRate: 0.999,
      armP95Ms: 1_000,
      workerLagP95Ms: 10_000,
    });
    assert.equal(r.burning, false);
    assert.equal(r.breaches.length, 0);
  });

  it("burns when ingest success drops", () => {
    const r = evaluateSloBurn({
      ingestSuccessRate: SIGNAL_SLOS.ingestSuccessRate - 0.01,
    });
    assert.equal(r.burning, true);
    assert.equal(r.breaches[0]?.slo, "ingestSuccessRate");
  });

  it("burns when arm p95 exceeds target", () => {
    const r = evaluateSloBurn({ armP95Ms: SIGNAL_SLOS.armP95Ms + 1 });
    assert.equal(r.burning, true);
  });
});
