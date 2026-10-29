import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STALE_DELIVERY_PROVIDER,
  buildStaleDeliveryEnvelope,
  routeStaleReviewHeal,
  shouldHealOpenDeliveryInsteadOfReplan,
  staleDeliveryExternalId,
} from "./stale-delivery-heal-signal.js";

describe("stale-delivery-heal-signal (AG-033)", () => {
  it("prefers heal when PR is open", () => {
    assert.equal(
      shouldHealOpenDeliveryInsteadOfReplan({ prOpen: true }),
      true,
    );
    assert.equal(
      shouldHealOpenDeliveryInsteadOfReplan({ prOpen: true, merged: true }),
      false,
    );
    assert.equal(
      shouldHealOpenDeliveryInsteadOfReplan({ prOpen: false }),
      false,
    );
  });

  it("routes dirty → merge_conflict, open clean → stale_delivery, else replan", () => {
    assert.equal(
      routeStaleReviewHeal({
        hasPrNumber: true,
        prOpen: true,
        mergeable: false,
        mergeableState: "dirty",
      }),
      "merge_conflict",
    );
    assert.equal(
      routeStaleReviewHeal({
        hasPrNumber: true,
        prOpen: true,
        mergeable: true,
        mergeableState: "clean",
      }),
      "stale_delivery",
    );
    assert.equal(
      routeStaleReviewHeal({
        hasPrNumber: true,
        prOpen: true,
        mergeable: null,
        mergeableState: null,
      }),
      "stale_delivery",
    );
    assert.equal(
      routeStaleReviewHeal({
        hasPrNumber: true,
        prOpen: false,
        mergeable: true,
        mergeableState: "clean",
      }),
      "replan",
    );
    assert.equal(
      routeStaleReviewHeal({ hasPrNumber: false }),
      "replan",
    );
    assert.equal(
      routeStaleReviewHeal({
        hasPrNumber: true,
        prOpen: true,
        merged: true,
        mergeableState: "dirty",
      }),
      "replan",
    );
  });

  it("builds stable externalId and licensed title", () => {
    assert.equal(
      staleDeliveryExternalId({
        owner: "coppergateai",
        repo: "coppergate",
        prNumber: 190,
        headSha: "abc123def456",
      }),
      "stale_pr:coppergateai/coppergate:190:abc123de",
    );
    const env = buildStaleDeliveryEnvelope({
      owner: "coppergateai",
      repo: "coppergate",
      prNumber: 190,
      headRef: "coppergate/ag-033",
      headSha: "abc123def",
      baseRef: "main",
      parentTitle: "AG-033: Stale open PR heal instead of NEEDS_REPLAN",
    });
    assert.equal(env.provider, STALE_DELIVERY_PROVIDER);
    assert.equal(
      env.externalId,
      "stale_pr:coppergateai/coppergate:190:abc123de",
    );
    assert.equal(env.severity, "high");
    assert.match(env.title, /^AG-033:/);
    assert.match(env.body, /same head/i);
    assert.match(env.body, /pull\/190/);
    assert.match(env.body, /AG-033/);
  });
});
