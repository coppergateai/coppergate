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
    assert.deepEqual(resolveSpawnProfiles("jira"), [
      "engineer",
      "proposer",
    ]);
    assert.deepEqual(resolveSpawnProfiles("sentry"), ["fixer"]);
    assert.deepEqual(resolveSpawnProfiles("maintainer"), [
      "engineer",
      "reviewer",
    ]);
    assert.deepEqual(resolveSpawnProfiles("vision_replan"), [
      "proposer",
      "engineer",
    ]);
  });

  it("rejects unbound override keys", () => {
    assert.deepEqual(resolveSpawnProfiles("sonar", ["hacker", "fixer"]), [
      "fixer",
    ]);
    assert.equal(isBoundedProfileKey("hacker"), false);
  });

  it("seeds full catalog", () => {
    assert.equal(PROFILE_CATALOG.length, 11);
    assert.ok(PROFILE_CATALOG.some((p) => p.key === "proposer"));
    assert.ok(PROFILE_CATALOG.some((p) => p.key === "reviewer"));
  });
});
