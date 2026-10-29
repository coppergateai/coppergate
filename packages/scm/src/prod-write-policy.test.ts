import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ProdWritePolicyError,
  assertDefaultBranchContentsWriteAllowed,
  assertDefaultBranchMergeAllowed,
  assertProductionDeployAllowed,
  assertReleaseAllowed,
  resolveDefaultBranchMergeFlag,
} from "./prod-write-policy.js";

describe("SEC-036 prod-write-policy", () => {
  it("refuses default-branch merge without explicit flag", () => {
    assert.throws(
      () => assertDefaultBranchMergeAllowed({ allowDefaultBranchWrite: false }),
      (err: unknown) => err instanceof ProdWritePolicyError,
    );
    assert.throws(
      () => assertDefaultBranchMergeAllowed({ allowDefaultBranchWrite: undefined as unknown as boolean }),
      (err: unknown) => err instanceof ProdWritePolicyError,
    );
    assert.doesNotThrow(() =>
      assertDefaultBranchMergeAllowed({ allowDefaultBranchWrite: true }),
    );
  });

  it("refuses release and prod deploy without explicit flags", () => {
    assert.throws(() => assertReleaseAllowed({ allowRelease: false }));
    assert.throws(() =>
      assertProductionDeployAllowed({ prodWritesEnabled: false }),
    );
    assert.doesNotThrow(() => assertReleaseAllowed({ allowRelease: true }));
    assert.doesNotThrow(() =>
      assertProductionDeployAllowed({ prodWritesEnabled: true }),
    );
  });

  it("contents write gates only the default branch ref", () => {
    assert.throws(() =>
      assertDefaultBranchContentsWriteAllowed({
        allowDefaultBranchWrite: false,
        defaultBranch: "main",
      }),
    );
    assert.throws(() =>
      assertDefaultBranchContentsWriteAllowed({
        allowDefaultBranchWrite: false,
        branch: "main",
        defaultBranch: "main",
      }),
    );
    assert.doesNotThrow(() =>
      assertDefaultBranchContentsWriteAllowed({
        allowDefaultBranchWrite: false,
        branch: "feature/x",
        defaultBranch: "main",
      }),
    );
    assert.doesNotThrow(() =>
      assertDefaultBranchContentsWriteAllowed({
        allowDefaultBranchWrite: true,
        defaultBranch: "main",
      }),
    );
  });

  it("resolveDefaultBranchMergeFlag honors mergeEnabled and path", () => {
    assert.equal(
      resolveDefaultBranchMergeFlag({
        mergeEnabled: false,
        via: "accept",
        autonomyLevel: "L2",
      }),
      false,
    );
    assert.equal(
      resolveDefaultBranchMergeFlag({
        mergeEnabled: true,
        via: "accept",
        autonomyLevel: "L1",
      }),
      false,
    );
    assert.equal(
      resolveDefaultBranchMergeFlag({
        mergeEnabled: true,
        via: "accept",
        autonomyLevel: "L2",
      }),
      true,
    );
    assert.equal(
      resolveDefaultBranchMergeFlag({
        mergeEnabled: true,
        via: "maintainer",
        maintainerAutoMerge: false,
      }),
      false,
    );
    assert.equal(
      resolveDefaultBranchMergeFlag({
        mergeEnabled: true,
        via: "maintainer",
        maintainerAutoMerge: true,
      }),
      true,
    );
  });
});
