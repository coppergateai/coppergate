import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DELIVERY_SHARE_TTL_MS,
  isDeliveryShareExpired,
} from "./share-reports.js";

describe("delivery share TTL", () => {
  it("treats fresh shares as valid", () => {
    const createdAt = new Date();
    assert.equal(isDeliveryShareExpired({ createdAt }), false);
  });

  it("expires shares older than TTL", () => {
    const createdAt = new Date(
      Date.now() - DEFAULT_DELIVERY_SHARE_TTL_MS - 1_000,
    );
    assert.equal(isDeliveryShareExpired({ createdAt }), true);
  });

  it("honors custom ttlMs", () => {
    const createdAt = new Date(Date.now() - 60_000);
    assert.equal(isDeliveryShareExpired({ createdAt }, new Date(), 30_000), true);
    assert.equal(
      isDeliveryShareExpired({ createdAt }, new Date(), 120_000),
      false,
    );
  });
});
