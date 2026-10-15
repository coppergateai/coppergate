import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROFILE_CATALOG,
  resolveSpawnProfiles,
  isBoundedProfileKey,
} from "./spawn-matrix.js";

describe("spawn matrix", () => {
  it("maps providers to bounded roles", () => {
    assert.deepEqual(resolveSpawnProfiles("sonar"), ["fixer", "security"]);
    assert.deepEqual(resolveSpawnProfiles("jira"), ["engineer"]);
    assert.deepEqual(resolveSpawnProfiles("sentry"), ["fixer"]);
  });

  it("rejects unbound override keys", () => {
    assert.deepEqual(resolveSpawnProfiles("sonar", ["hacker", "fixer"]), [
      "fixer",
    ]);
    assert.equal(isBoundedProfileKey("hacker"), false);
  });

  it("seeds full catalog", () => {
    assert.equal(PROFILE_CATALOG.length, 6);
  });
});
