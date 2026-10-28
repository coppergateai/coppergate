import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ARENA_MIN_HUMAN,
  describeL2AutoMerge,
  describeMaintainerSettingsHonesty,
  describeMinHumanHonesty,
  describeReleaseAssistantHonesty,
  effectiveArenaMinHuman,
} from "./project-settings-honesty.js";

describe("project settings honesty (P-143)", () => {
  it("effectiveArenaMinHuman defaults on when arena row missing", () => {
    assert.equal(DEFAULT_ARENA_MIN_HUMAN, true);
    assert.equal(effectiveArenaMinHuman(null), true);
    assert.equal(effectiveArenaMinHuman(undefined), true);
    assert.equal(effectiveArenaMinHuman(false), false);
  });

  it("describeL2AutoMerge — accept path vs maintainer path", () => {
    const off = describeL2AutoMerge({
      autonomyLevel: "L1",
      mergeEnabled: false,
    });
    assert.equal(off.acceptPathActive, false);
    assert.equal(off.maintainerPathActive, false);
    assert.ok(off.blockers.some((b) => /L2/.test(b)));

    const acceptOnly = describeL2AutoMerge({
      autonomyLevel: "L2",
      mergeEnabled: true,
      maintainerEnabled: false,
    });
    assert.equal(acceptOnly.acceptPathActive, true);
    assert.equal(acceptOnly.maintainerPathActive, false);

    const both = describeL2AutoMerge({
      autonomyLevel: "L2",
      mergeEnabled: true,
      maintainerEnabled: true,
      maintainerAutoMerge: true,
    });
    assert.equal(both.acceptPathActive, true);
    assert.equal(both.maintainerPathActive, true);

    const policyOff = describeL2AutoMerge({
      autonomyLevel: "L2",
      mergeEnabled: true,
      maintainerEnabled: true,
      maintainerAutoMerge: false,
    });
    assert.equal(policyOff.maintainerPathActive, false);
    assert.ok(
      policyOff.blockers.some((b) => /auto-merge off/i.test(b)),
    );
  });

  it("describeMinHumanHonesty — default-on copy when no arena row", () => {
    const d = describeMinHumanHonesty(null);
    assert.equal(d.effective, true);
    assert.equal(d.stored, null);
    assert.match(d.summary, /default/i);
  });

  it("describeReleaseAssistantHonesty — opt-in release path (P-144)", () => {
    const off = describeReleaseAssistantHonesty({
      maintainerEnabled: true,
      autoRelease: false,
    });
    assert.equal(off.releasePathActive, false);
    assert.match(off.summary, /auto-release/i);
    assert.match(off.notProdDeployLine, /production/i);
    assert.match(off.auditLine, /maintainer\.release/);

    const on = describeReleaseAssistantHonesty({
      maintainerEnabled: true,
      autoRelease: true,
    });
    assert.equal(on.releasePathActive, true);
    assert.match(on.summary, /GitHub tag/i);
  });

  it("describeMaintainerSettingsHonesty — not prod deploy + fail-closed", () => {
    const on = describeMaintainerSettingsHonesty({ maintainerEnabled: true });
    assert.match(on.notProdDeployLine, /production deploy/i);
    assert.equal(on.failClosedLines.length, 3);
    assert.ok(on.failClosedLines.some((l) => /kill-switch/i.test(l)));
    assert.ok(on.failClosedLines.some((l) => /envelope/i.test(l)));
  });
});
