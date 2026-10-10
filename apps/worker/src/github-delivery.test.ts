import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDeliveryMode } from "./github-delivery.js";

describe("resolveDeliveryMode", () => {
  it("defaults to fake", () => {
    assert.equal(resolveDeliveryMode({}), "fake");
    assert.equal(resolveDeliveryMode({ GITHUB_DELIVERY_MODE: "FAKE" }), "fake");
  });

  it("enables http when configured", () => {
    assert.equal(resolveDeliveryMode({ GITHUB_DELIVERY_MODE: "http" }), "http");
    assert.equal(resolveDeliveryMode({ GITHUB_DELIVERY_MODE: "HTTP" }), "http");
  });
});
