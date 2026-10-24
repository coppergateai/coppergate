import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultTemperamentForProfileKey,
  strategyForTemperament,
  withTemperamentGuidance,
} from "./temperament.js";

describe("temperament", () => {
  it("defaults by profile key", () => {
    assert.equal(defaultTemperamentForProfileKey("security"), "steady");
    assert.equal(defaultTemperamentForProfileKey("triager"), "swift");
    assert.equal(defaultTemperamentForProfileKey("engineer"), "balanced");
  });

  it("maps to strategy", () => {
    assert.equal(strategyForTemperament("steady"), "fortress");
    assert.equal(strategyForTemperament("swift"), "blitz");
    assert.equal(strategyForTemperament("balanced"), "balanced");
  });

  it("injects character blurb once", () => {
    const once = withTemperamentGuidance("Ship features.", "swift");
    assert.match(once, /Character: swift/);
    const twice = withTemperamentGuidance(once, "swift");
    assert.equal(twice, once);
  });
});
