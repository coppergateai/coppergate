import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MaintainerPolicy } from "./maintainer.js";
import {
  sanitizePolicyForMaintainerEnable,
  shouldInitWorkspaceBudgetOnEnable,
} from "./maintainer-enable-guard.js";

const DEFAULT_MONTHLY_BUDGET_MICROS = 8_000_000;

/** Minimal defaults for unit tests (matches DEFAULT_MAINTAINER_POLICY). */
const TEST_DEFAULTS: MaintainerPolicy = {
  enabled: false,
  monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS,
  softAlertRatio: 0.8,
  autoMerge: true,
  autoRelease: false,
  selfImprove: true,
  communityReplies: true,
  communityScout: true,
  communityScoutIntervalHours: 8,
  communityScoutMaxPerRun: 2,
  communityScoutMaxOpenGoodFirst: 5,
  communityScoutAutoImportMax: 1,
  shipRollbackOnCiFail: true,
  coordinatedMultiRepo: false,
  allowedSignalProviders: [
    "*",
    "ci_failure",
    "merge_conflict",
    "stale_delivery",
    "sentry",
    "dependabot",
    "codeql",
  ],
  pathAllowlist: [],
  maxTournamentN: 1,
  visionBriefId: null,
  replanIntervalDays: 7,
  autoQueueReplanTasks: true,
  maxAutoQueuePerReplan: 2,
  continuousBacklog: true,
  releaseTagStyle: "daily",
  architectureRepo: null,
  architecturePaths: null,
};

describe("AG-030 maintainer enable guard", () => {
  it("strips coordinated multi-repo and auto-release on enable", () => {
    const { policy, clamps } = sanitizePolicyForMaintainerEnable(
      {
        coordinatedMultiRepo: true,
        autoRelease: true,
      },
      TEST_DEFAULTS,
      { existingWorkspaceCapMicros: 5_000_000 },
    );
    assert.equal(policy.coordinatedMultiRepo, false);
    assert.equal(policy.autoRelease, false);
    assert.equal(clamps.stripped.coordinatedMultiRepo, true);
    assert.equal(clamps.stripped.autoRelease, true);
  });

  it("clamps monthly budget to existing workspace cap", () => {
    const lowCap = 500_000;
    const { policy, clamps } = sanitizePolicyForMaintainerEnable(
      { monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS },
      TEST_DEFAULTS,
      { existingWorkspaceCapMicros: lowCap },
    );
    assert.equal(policy.monthlyBudgetMicros, lowCap);
    assert.equal(clamps.monthlyBudgetClamped, true);
    assert.equal(clamps.spendCapUnchanged, true);
  });

  it("does not clamp budget when no workspace envelope exists", () => {
    const { policy, clamps } = sanitizePolicyForMaintainerEnable(
      { monthlyBudgetMicros: 6_000_000 },
      TEST_DEFAULTS,
      { existingWorkspaceCapMicros: null },
    );
    assert.equal(policy.monthlyBudgetMicros, 6_000_000);
    assert.equal(clamps.monthlyBudgetClamped, false);
    assert.equal(clamps.spendCapUnchanged, false);
    assert.equal(shouldInitWorkspaceBudgetOnEnable(null), true);
  });

  it("rejects expanded signal providers on enable", () => {
    const { policy, clamps } = sanitizePolicyForMaintainerEnable(
      { allowedSignalProviders: ["*", "ci_failure", "custom_vendor"] },
      TEST_DEFAULTS,
      { existingWorkspaceCapMicros: null },
    );
    assert.deepEqual(policy.allowedSignalProviders, ["*", "ci_failure"]);
    assert.equal(clamps.stripped.allowedSignalProviders, true);
  });
});
