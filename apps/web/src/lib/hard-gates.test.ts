import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HARD_GATE_COPY, acceptBlockedReason } from "./hard-gates.js";

describe("acceptBlockedReason", () => {
  it("returns null when accept-ready", () => {
    assert.equal(
      acceptBlockedReason({
        acceptReady: true,
        ciBlocking: false,
        ciAwaitingLive: false,
        ciPassed: true,
      }),
      null,
    );
  });

  it("does not call pending gates a CI failure", () => {
    assert.equal(
      acceptBlockedReason({
        acceptReady: false,
        ciBlocking: false,
        ciAwaitingLive: true,
        ciPassed: false,
      }),
      HARD_GATE_COPY.ciPending,
    );
  });

  it("distinguishes VALIDATING from CI failed", () => {
    assert.equal(
      acceptBlockedReason({
        acceptReady: false,
        ciBlocking: false,
        ciAwaitingLive: true,
        ciPassed: false,
        stillValidating: true,
      }),
      HARD_GATE_COPY.stillValidating,
    );
  });

  it("surfaces real CI failures", () => {
    assert.equal(
      acceptBlockedReason({
        acceptReady: false,
        ciBlocking: true,
        ciAwaitingLive: false,
        ciPassed: false,
      }),
      HARD_GATE_COPY.ciFailed,
    );
  });

  it("prefers delivery failed over still validating", () => {
    assert.equal(
      acceptBlockedReason({
        acceptReady: false,
        ciBlocking: false,
        ciAwaitingLive: true,
        ciPassed: false,
        stillValidating: true,
        deliveryFailed: true,
      }),
      HARD_GATE_COPY.deliveryFailed,
    );
  });
});
