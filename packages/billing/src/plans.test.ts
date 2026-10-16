import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HOSTED_PLANS, planFromPriceId } from "./plans.js";

describe("hosted plans", () => {
  it("exposes starter and pro", () => {
    assert.deepEqual(
      HOSTED_PLANS.map((p) => p.id),
      ["starter", "pro"],
    );
  });

  it("maps price ids", () => {
    assert.equal(
      planFromPriceId("price_s", { starter: "price_s", pro: "price_p" }),
      "starter",
    );
    assert.equal(
      planFromPriceId("price_p", { starter: "price_s", pro: "price_p" }),
      "pro",
    );
    assert.equal(planFromPriceId("x", { starter: "a", pro: "b" }), null);
  });
});
