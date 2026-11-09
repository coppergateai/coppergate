import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STRATEGY_ACTION_PROFILES,
  strategyActionProfile,
  strategyGuidance,
  strategySpendFraction,
} from "./strategy.js";

describe("strategy action profiles", () => {
  it("exposes spendBias as soft cap fraction and guidance", () => {
    assert.equal(strategySpendFraction("blitz"), 0.4);
    assert.equal(strategySpendFraction("balanced"), 0.7);
    assert.equal(strategySpendFraction("fortress"), 0.9);
    assert.equal(
      strategySpendFraction("blitz"),
      STRATEGY_ACTION_PROFILES.blitz.spendBias,
    );
    assert.match(strategyGuidance("fortress"), /Strategy fortress:/);
    assert.ok(
      strategyActionProfile("blitz").verificationIntensity <
        strategyActionProfile("fortress").verificationIntensity,
    );
  });
});
