import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError, toErrorEnvelope } from "./api-error.js";

describe("toErrorEnvelope", () => {
  it("maps ApiError fields", () => {
    const err = new ApiError("not_ready", "database unavailable");
    const { status, body } = toErrorEnvelope(err, "cid-9");
    assert.equal(status, 503);
    assert.deepEqual(body, {
      error: {
        code: "not_ready",
        message: "database unavailable",
        correlationId: "cid-9",
      },
    });
  });

  it("hides unknown errors", () => {
    const { status, body } = toErrorEnvelope(new Error("secret"), "cid-1");
    assert.equal(status, 500);
    assert.equal(body.error.code, "internal");
    assert.equal(body.error.message, "Internal server error");
    assert.equal(body.error.correlationId, "cid-1");
  });
});
