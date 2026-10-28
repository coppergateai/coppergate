import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMaintainerPolicy } from "@coppergate/db";

describe("design scout policy short-circuit", () => {
  it("defaults designScout to disabled", () => {
    const p = parseMaintainerPolicy("{}");
    assert.equal(p.designScout, false);
    assert.equal(p.designScoutIntervalHours, 24);
    assert.equal(p.designScoutMaxPerRun, 2);
    assert.equal(p.designScoutAutoImportMax, 0);
    assert.equal(p.designScoutBaseUrl, null);
  });

  it("parses design scout overrides", () => {
    const p = parseMaintainerPolicy(
      JSON.stringify({
        designScout: true,
        designScoutIntervalHours: 12,
        designScoutMaxPerRun: 3,
        designScoutBaseUrl: "https://www.coppergate.ai/",
        designScoutAutoImportMax: 1,
      }),
    );
    assert.equal(p.designScout, true);
    assert.equal(p.designScoutIntervalHours, 12);
    assert.equal(p.designScoutMaxPerRun, 3);
    assert.equal(p.designScoutBaseUrl, "https://www.coppergate.ai");
    assert.equal(p.designScoutAutoImportMax, 1);
  });
});
