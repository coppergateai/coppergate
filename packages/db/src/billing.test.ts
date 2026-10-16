import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePlan,
  normalizeBillingPlan,
  normalizeSubscriptionStatus,
} from "./billing.js";

describe("billing helpers", () => {
  it("normalizes plans", () => {
    assert.equal(normalizeBillingPlan("pro"), "pro");
    assert.equal(normalizeBillingPlan("nope"), "community");
  });

  it("normalizes status", () => {
    assert.equal(normalizeSubscriptionStatus("active"), "active");
    assert.equal(normalizeSubscriptionStatus("weird"), "incomplete");
  });

  it("effectivePlan requires active/trialing", () => {
    assert.equal(effectivePlan(null), "community");
    assert.equal(
      effectivePlan({
        id: "1",
        workspaceId: "w",
        plan: "pro",
        status: "canceled",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      "community",
    );
    assert.equal(
      effectivePlan({
        id: "1",
        workspaceId: "w",
        plan: "starter",
        status: "active",
        stripeCustomerId: "cus",
        stripeSubscriptionId: "sub",
        stripePriceId: "price",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      "starter",
    );
  });
});
