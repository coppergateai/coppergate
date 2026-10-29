import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERGE_CONFLICT_PROVIDER,
  buildMergeConflictEnvelope,
  isMergeConflictDirty,
  mergeConflictExternalId,
  shouldEmitMergeConflictInsteadOfReplan,
} from "./merge-conflict-signal.js";

describe("merge-conflict-signal (AG-032)", () => {
  it("detects dirty mergeable_state", () => {
    assert.equal(
      isMergeConflictDirty({
        prOpen: true,
        mergeable: false,
        mergeableState: "dirty",
      }),
      true,
    );
    assert.equal(
      isMergeConflictDirty({
        prOpen: true,
        mergeable: true,
        mergeableState: "clean",
      }),
      false,
    );
    assert.equal(
      isMergeConflictDirty({
        prOpen: false,
        mergeable: false,
        mergeableState: "dirty",
      }),
      false,
    );
    assert.equal(
      isMergeConflictDirty({
        prOpen: true,
        merged: true,
        mergeable: false,
        mergeableState: "dirty",
      }),
      false,
    );
  });

  it("prefers conflict signal over replan when PR dirty", () => {
    assert.equal(
      shouldEmitMergeConflictInsteadOfReplan({
        prOpen: true,
        mergeable: false,
        mergeableState: "dirty",
      }),
      true,
    );
    assert.equal(
      shouldEmitMergeConflictInsteadOfReplan({
        prOpen: true,
        mergeable: true,
        mergeableState: "clean",
      }),
      false,
    );
  });

  it("builds stable externalId and licensed title", () => {
    assert.equal(
      mergeConflictExternalId({
        owner: "coppergateai",
        repo: "coppergate",
        prNumber: 190,
      }),
      "pr:coppergateai/coppergate:190",
    );
    const env = buildMergeConflictEnvelope({
      owner: "coppergateai",
      repo: "coppergate",
      prNumber: 190,
      headRef: "coppergate/ag-018",
      headSha: "abc123def",
      baseRef: "main",
      parentTitle:
        "AG-018: Contender N pin under dogfood Replan must not drift",
    });
    assert.equal(env.provider, MERGE_CONFLICT_PROVIDER);
    assert.equal(env.externalId, "pr:coppergateai/coppergate:190");
    assert.equal(env.severity, "high");
    assert.match(env.title, /^AG-018:/);
    assert.match(env.body, /same head/i);
    assert.match(env.body, /pull\/190/);
  });
});
