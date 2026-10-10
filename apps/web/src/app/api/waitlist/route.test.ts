import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWaitlistEmail } from "@coppergate/db";

describe("waitlist API contract", () => {
  it("shares email normalization with the db package", () => {
    assert.equal(normalizeWaitlistEmail("Pilot@Coppergate.ai"), "pilot@coppergate.ai");
  });
});
