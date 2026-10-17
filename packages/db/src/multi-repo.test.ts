import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSecondaryRepoAllowed,
  parseMultiRepoPolicyJson,
  resolveMultiRepoPolicy,
  serializeMultiRepoPolicy,
} from "./multi-repo.js";

describe("multi-repo policy", () => {
  it("defaults off", () => {
    const p = resolveMultiRepoPolicy(null);
    assert.equal(p.enabled, false);
    assert.equal(p.coordinatedPrs, false);
    assert.equal(p.maxSecondaryRepos, 2);
  });

  it("caps secondary repos and files", () => {
    const p = resolveMultiRepoPolicy({
      enabled: true,
      maxSecondaryRepos: 99,
      maxSecondaryFiles: 999,
      coordinatedPrs: true,
    });
    assert.equal(p.maxSecondaryRepos, 5);
    assert.equal(p.maxSecondaryFiles, 100);
    assert.equal(p.coordinatedPrs, true);
  });

  it("coordinatedPrs requires enabled", () => {
    const p = resolveMultiRepoPolicy({
      enabled: false,
      coordinatedPrs: true,
    });
    assert.equal(p.coordinatedPrs, false);
  });

  it("parse/serialize round-trip", () => {
    const raw = serializeMultiRepoPolicy({
      enabled: true,
      maxSecondaryRepos: 3,
      maxSecondaryFiles: 40,
      coordinatedPrs: true,
    });
    const parsed = parseMultiRepoPolicyJson(raw);
    assert.equal(parsed.enabled, true);
    assert.equal(parsed.maxSecondaryRepos, 3);
    assert.equal(parsed.coordinatedPrs, true);
  });

  it("assertSecondaryRepoAllowed fail-closed when disabled", () => {
    const r = assertSecondaryRepoAllowed(resolveMultiRepoPolicy(null), {
      secondaryCount: 1,
      filesTouched: 0,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "multi_repo_disabled");
  });

  it("assertSecondaryRepoAllowed enforces caps when enabled", () => {
    const p = resolveMultiRepoPolicy({
      enabled: true,
      maxSecondaryRepos: 2,
      maxSecondaryFiles: 10,
    });
    assert.equal(
      assertSecondaryRepoAllowed(p, { secondaryCount: 2, filesTouched: 5 }).ok,
      true,
    );
    const overRepos = assertSecondaryRepoAllowed(p, {
      secondaryCount: 3,
      filesTouched: 0,
    });
    assert.equal(overRepos.ok, false);
    const overFiles = assertSecondaryRepoAllowed(p, {
      secondaryCount: 1,
      filesTouched: 11,
    });
    assert.equal(overFiles.ok, false);
  });
});
