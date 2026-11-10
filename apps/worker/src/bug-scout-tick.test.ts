import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMaintainerPolicy } from "@coppergate/db";

describe("bug scout policy short-circuit", () => {
  it("defaults bugScout to disabled", () => {
    const p = parseMaintainerPolicy("{}");
    assert.equal(p.bugScout, false);
    assert.equal(p.bugScoutIntervalHours, 12);
    assert.equal(p.bugScoutMaxPerRun, 2);
    assert.equal(p.bugScoutLookbackHours, 48);
  });

  it("parses bug scout overrides", () => {
    const p = parseMaintainerPolicy(
      JSON.stringify({
        bugScout: true,
        bugScoutIntervalHours: 6,
        bugScoutMaxPerRun: 1,
        bugScoutLookbackHours: 24,
      }),
    );
    assert.equal(p.bugScout, true);
    assert.equal(p.bugScoutIntervalHours, 6);
    assert.equal(p.bugScoutMaxPerRun, 1);
    assert.equal(p.bugScoutLookbackHours, 24);
  });
});
