import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WAITING_CI_TIMEOUT_MS,
  MAX_LEASE_RECLAIMS,
  parseReclaimCount,
  resolveWaitingCiTimeoutMs,
} from "./runs.js";

describe("reaper policy helpers", () => {
  it("parses reclaim:N counters", () => {
    assert.equal(parseReclaimCount("lease_reclaimed", "reclaim:1"), 1);
    assert.equal(parseReclaimCount("lease_reclaimed", "reclaim:3"), 3);
    assert.equal(parseReclaimCount("lease_reclaimed", "reclaim:0"), 0);
    assert.equal(parseReclaimCount("other", "reclaim:2"), 0);
    assert.equal(parseReclaimCount("lease_reclaimed", "nope"), 0);
  });

  it("keeps max reclaim bound positive", () => {
    assert.ok(MAX_LEASE_RECLAIMS >= 1);
  });

  it("resolves WAITING_CI timeout from env with floor", () => {
    assert.equal(resolveWaitingCiTimeoutMs({}), DEFAULT_WAITING_CI_TIMEOUT_MS);
    assert.equal(
      resolveWaitingCiTimeoutMs({ WAITING_CI_TIMEOUT_MS: "120000" }),
      120_000,
    );
    assert.equal(
      resolveWaitingCiTimeoutMs({ WAITING_CI_TIMEOUT_MS: "100" }),
      DEFAULT_WAITING_CI_TIMEOUT_MS,
    );
    assert.equal(
      resolveWaitingCiTimeoutMs({ WAITING_CI_TIMEOUT_MS: "nope" }),
      DEFAULT_WAITING_CI_TIMEOUT_MS,
    );
  });
});
