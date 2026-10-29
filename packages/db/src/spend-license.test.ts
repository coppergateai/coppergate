import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  licenseTitleForProgram,
  openIdFromTaskTitle,
  SpendLicenseError,
} from "./spend-license.js";
import {
  buildShipGateHealTitle,
  isShipGateHealTitle,
} from "./ship-gate-heal-policy.js";

describe("spend-license", () => {
  it("openIdFromTaskTitle extracts program IDs", () => {
    assert.equal(openIdFromTaskTitle("AG-011: Pause honesty"), "AG-011");
    assert.equal(openIdFromTaskTitle("P-104: Open Program Runtime"), "P-104");
    assert.equal(openIdFromTaskTitle("scaffold without id"), null);
  });

  it("SpendLicenseError carries code", () => {
    const err = new SpendLicenseError(
      "missing_open_id",
      "No Open ID — Arena cannot spend without an Open Program line",
    );
    assert.equal(err.code, "missing_open_id");
    assert.match(err.message, /No Open ID/);
  });

  it("licenseTitleForProgram prefixes next Open ID when program-bound", () => {
    const md = `
| ID | Title | Status |
| P-007 | Good first issue | Open |
| AG-012 | Lean roster | Open |
`;
    const out = licenseTitleForProgram({
      title: "Sentry: TypeError in page",
      programBound: true,
      roadmapMarkdown: md,
    });
    assert.equal(out.licensed, true);
    assert.ok(out.openId);
    assert.match(out.title, new RegExp(`^${out.openId}:`));
  });

  it("licenseTitleForProgram is a no-op when already licensed or unbound", () => {
    assert.equal(
      licenseTitleForProgram({
        title: "AG-011: already tagged",
        programBound: true,
      }).licensed,
      false,
    );
    assert.equal(
      licenseTitleForProgram({
        title: "freestyle",
        programBound: false,
      }).openId,
      null,
    );
  });

  it("AG-031 ship-gate heal titles are recognized without Open ID", () => {
    const title = buildShipGateHealTitle("ff6f41e6");
    assert.equal(isShipGateHealTitle(title), true);
    assert.equal(openIdFromTaskTitle(title), null);
  });
});
