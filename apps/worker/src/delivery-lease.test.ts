import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DELIVERY_HEARTBEAT_WALL_MS,
  DEFAULT_DELIVERY_LEASE_BASE_MS,
  DEFAULT_DELIVERY_LEASE_MAX_MS,
  deliveryHeartbeatIntervalMs,
  resolveDeliveryLeaseMs,
  shouldRenewDeliveryHeartbeat,
} from "./delivery-lease.js";

describe("delivery lease (F3)", () => {
  it("scales lease with file count and respects max", () => {
    assert.equal(
      resolveDeliveryLeaseMs({ leaseMs: 30_000, fileCount: 1 }),
      DEFAULT_DELIVERY_LEASE_BASE_MS,
    );
    const ten = resolveDeliveryLeaseMs({ leaseMs: 30_000, fileCount: 10 });
    assert.ok(ten > DEFAULT_DELIVERY_LEASE_BASE_MS);
    assert.ok(ten <= DEFAULT_DELIVERY_LEASE_MAX_MS);

    const many = resolveDeliveryLeaseMs({ leaseMs: 30_000, fileCount: 500 });
    assert.equal(many, DEFAULT_DELIVERY_LEASE_MAX_MS);
  });

  it("never goes below worker leaseMs", () => {
    assert.equal(
      resolveDeliveryLeaseMs({ leaseMs: 15 * 60_000, fileCount: 1 }),
      15 * 60_000,
    );
  });

  it("stops heartbeat renewals after wall", () => {
    const started = 1_000_000;
    assert.equal(
      shouldRenewDeliveryHeartbeat({
        deliveryStartedAtMs: started,
        nowMs: started + 60_000,
      }),
      true,
    );
    assert.equal(
      shouldRenewDeliveryHeartbeat({
        deliveryStartedAtMs: started,
        nowMs: started + DEFAULT_DELIVERY_HEARTBEAT_WALL_MS,
      }),
      false,
    );
  });

  it("heartbeat interval is lease/3 with 1s floor", () => {
    assert.equal(deliveryHeartbeatIntervalMs(30_000), 10_000);
    assert.equal(deliveryHeartbeatIntervalMs(1_000), 1_000);
  });
});
