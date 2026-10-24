import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VACUOUS_NO_CI_GRACE_MS,
  pastVacuousGrace,
} from "./refresh-ci-evidence.js";

describe("pastVacuousGrace", () => {
  it("requires finishedAt and full grace window", () => {
    const now = 1_000_000;
    assert.equal(pastVacuousGrace(null, now), false);
    assert.equal(pastVacuousGrace(undefined, now), false);
    assert.equal(
      pastVacuousGrace(new Date(now - VACUOUS_NO_CI_GRACE_MS + 1), now),
      false,
    );
    assert.equal(
      pastVacuousGrace(new Date(now - VACUOUS_NO_CI_GRACE_MS), now),
      true,
    );
  });
});
