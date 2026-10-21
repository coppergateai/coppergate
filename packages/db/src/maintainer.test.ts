import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAINTAINER_POLICY,
  DEFAULT_MONTHLY_BUDGET_MICROS,
  buildMaintainerReleaseTag,
  parseMaintainerPolicy,
  pickMetaTournamentChallenger,
  selectAutoAcceptRun,
  serializeMaintainerPolicy,
  shouldRollbackProfileForFitness,
  taskMatchesPathAllowlist,
} from "./maintainer.js";
import { shouldRollMonthlyPeriod } from "./budgets.js";

describe("maintainer policy", () => {
  it("parses defaults when raw is null", () => {
    const p = parseMaintainerPolicy(null);
    assert.equal(p.enabled, false);
    assert.equal(p.monthlyBudgetMicros, DEFAULT_MONTHLY_BUDGET_MICROS);
    assert.equal(p.autoMerge, true);
    assert.equal(p.autoQueueReplanTasks, true);
    assert.equal(p.maxAutoQueuePerReplan, 2);
    assert.equal(p.releaseTagStyle, "daily");
  });

  it("merges partial JSON", () => {
    const p = parseMaintainerPolicy(
      JSON.stringify({
        enabled: true,
        monthlyBudgetMicros: 5_000_000,
        maxTournamentN: 9,
        autoQueueReplanTasks: false,
        maxAutoQueuePerReplan: 4,
        releaseTagStyle: "semver_patch",
      }),
    );
    assert.equal(p.enabled, true);
    assert.equal(p.monthlyBudgetMicros, 5_000_000);
    assert.equal(p.maxTournamentN, 3);
    assert.equal(p.selfImprove, DEFAULT_MAINTAINER_POLICY.selfImprove);
    assert.equal(p.autoQueueReplanTasks, false);
    assert.equal(p.maxAutoQueuePerReplan, 4);
    assert.equal(p.releaseTagStyle, "semver_patch");
  });

  it("round-trips serialize", () => {
    const raw = serializeMaintainerPolicy({
      ...DEFAULT_MAINTAINER_POLICY,
      enabled: true,
      monthlyBudgetMicros: 5_000_000,
    });
    const p = parseMaintainerPolicy(raw);
    assert.equal(p.enabled, true);
    assert.equal(p.monthlyBudgetMicros, 5_000_000);
  });
});

describe("selectAutoAcceptRun", () => {
  it("requires WINNER when any run is in a tournament", () => {
    const runs = [
      {
        id: "loser",
        tournamentId: "t1",
        tournamentResult: "LOSER",
      },
      {
        id: "pending",
        tournamentId: "t1",
        tournamentResult: null,
      },
    ];
    assert.equal(selectAutoAcceptRun(runs), null);
  });

  it("picks WINNER over later non-winner runs", () => {
    const winner = {
      id: "win",
      tournamentId: "t1",
      tournamentResult: "WINNER",
    };
    const later = {
      id: "later",
      tournamentId: "t1",
      tournamentResult: "LOSER",
    };
    assert.equal(selectAutoAcceptRun([later, winner]), winner);
  });

  it("allows latest solo run when no tournament", () => {
    const solo = {
      id: "solo",
      tournamentId: null,
      tournamentResult: null,
    };
    assert.equal(selectAutoAcceptRun([solo]), solo);
  });
});

describe("path allowlist + release tags", () => {
  it("allows all when allowlist empty", () => {
    assert.equal(taskMatchesPathAllowlist('["cmd/**"]', []), true);
  });

  it("matches intersecting paths", () => {
    assert.equal(
      taskMatchesPathAllowlist('["cmd/**", "pkg/**"]', ["cmd/"]),
      true,
    );
    assert.equal(
      taskMatchesPathAllowlist('["docs/**"]', ["cmd/", "internal/"]),
      false,
    );
  });

  it("builds daily and semver_patch tags", () => {
    const when = new Date("2026-10-21T12:00:00.000Z");
    assert.equal(
      buildMaintainerReleaseTag("daily", when, 3),
      "maintainer-2026-10-21",
    );
    assert.equal(
      buildMaintainerReleaseTag("semver_patch", when, 3),
      "v0.20261021.3",
    );
  });
});

describe("meta-tournament helpers", () => {
  it("picks bounded challenger roles", () => {
    assert.equal(pickMetaTournamentChallenger("engineer"), "reviewer");
    assert.equal(pickMetaTournamentChallenger("reviewer"), "engineer");
    assert.equal(pickMetaTournamentChallenger("proposer"), "engineer");
  });

  it("gates fitness rollback on efficiency drop", () => {
    assert.equal(
      shouldRollbackProfileForFitness({
        recentWinnerEfficiencies: [0.4, 0.3],
        lastEvolveAvgEfficiency: 0.9,
      }),
      true,
    );
    assert.equal(
      shouldRollbackProfileForFitness({
        recentWinnerEfficiencies: [0.9, 0.85],
        lastEvolveAvgEfficiency: 0.9,
      }),
      false,
    );
    assert.equal(
      shouldRollbackProfileForFitness({
        recentWinnerEfficiencies: [0.1],
        lastEvolveAvgEfficiency: 0.9,
      }),
      false,
    );
  });
});

describe("monthly budget period", () => {
  it("rolls when period missing", () => {
    assert.equal(shouldRollMonthlyPeriod(null), true);
  });

  it("rolls after 30 days", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    assert.equal(shouldRollMonthlyPeriod(old), true);
  });

  it("does not roll within same month window", () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    assert.equal(shouldRollMonthlyPeriod(recent), false);
  });
});
