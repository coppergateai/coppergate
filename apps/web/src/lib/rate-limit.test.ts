import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  clientIpFromRequest,
  resetRateLimitBuckets,
} from "./rate-limit.js";

describe("rate-limit", () => {
  beforeEach(() => {
    resetRateLimitBuckets();
  });

  it("allows up to limit then blocks", () => {
    const opts = { limit: 3, windowMs: 60_000, now: 1_000_000 };
    assert.equal(checkRateLimit("k", opts).ok, true);
    assert.equal(checkRateLimit("k", { ...opts, now: 1_000_001 }).ok, true);
    assert.equal(checkRateLimit("k", { ...opts, now: 1_000_002 }).ok, true);
    const blocked = checkRateLimit("k", { ...opts, now: 1_000_003 });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
  });

  it("resets after window", () => {
    const opts = { limit: 1, windowMs: 1_000, now: 5_000 };
    assert.equal(checkRateLimit("w", opts).ok, true);
    assert.equal(checkRateLimit("w", { ...opts, now: 5_500 }).ok, false);
    assert.equal(checkRateLimit("w", { ...opts, now: 6_100 }).ok, true);
  });

  it("reads client IP from x-forwarded-for", () => {
    const req = new Request("http://localhost/api/x", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    assert.equal(clientIpFromRequest(req), "203.0.113.9");
  });
});
