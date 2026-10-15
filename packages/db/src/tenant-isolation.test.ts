import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateIngestQuota } from "./signals.js";
import {
  assertSecondaryRepoAllowed,
  resolveMultiRepoPolicy,
} from "./multi-repo.js";

/**
 * TASK123 — pure isolation / blast-radius guards (no DB).
 * Complements skipped IDOR suites when DATABASE_URL is absent.
 */
describe("tenant isolation guards", () => {
  it("quota shed is workspace-local math", () => {
    const a = evaluateIngestQuota({ workspaceCount: 120, providerCount: 0 });
    const b = evaluateIngestQuota({ workspaceCount: 0, providerCount: 0 });
    assert.equal(a.ok, false);
    assert.equal(b.ok, true);
  });

  it("multi-repo stays off by default (blast radius)", () => {
    const policy = resolveMultiRepoPolicy(null);
    const r = assertSecondaryRepoAllowed(policy, {
      secondaryCount: 1,
      filesTouched: 1,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "multi_repo_disabled");
  });
});
