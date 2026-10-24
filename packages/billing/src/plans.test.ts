import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOSTED_PLANS,
  PUBLIC_PAID_PRICING_ENABLED,
  planFromPriceId,
  publicHostedPlans,
} from "./plans.js";

describe("hosted plans", () => {
  it("keeps internal starter and pro SKUs", () => {
    assert.deepEqual(
      HOSTED_PLANS.map((p) => p.id),
      ["starter", "pro"],
    );
  });

  it("keeps deferred SKU amounts at $99 / $199", () => {
    assert.equal(HOSTED_PLANS.find((p) => p.id === "starter")?.monthlyUsd, 99);
    assert.equal(HOSTED_PLANS.find((p) => p.id === "pro")?.monthlyUsd, 199);
  });

  it("hides paid plans from public catalog while pricing is deferred", () => {
    assert.equal(PUBLIC_PAID_PRICING_ENABLED, false);
    assert.deepEqual(publicHostedPlans(), []);
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
