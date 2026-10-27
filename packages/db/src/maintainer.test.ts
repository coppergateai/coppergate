import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO_MERGE_RETRY_COOLDOWN_MS,
  DEFAULT_MAINTAINER_POLICY,
  DEFAULT_MONTHLY_BUDGET_MICROS,
  LEAN_ARENA_PROFILE_KEYS,
  LEAN_ROSTER_AVAILABLE_MICROS,
  MIN_REPLAN_AVAILABLE_MICROS,
  buildMaintainerReleaseTag,
  isMergeProtectionBlock,
  isTerminalMergeSkip,
  isTransientNotMergeable,
  parseMaintainerPolicy,
  pickMetaTournamentChallenger,
  resolveAutoMergeSkipPrs,
  rosterKeysForAvailableBudget,
  selectAutoAcceptRun,
  selectCiRefreshRun,
  serializeMaintainerPolicy,
  shouldReplanVision,
  shouldRollbackProfileForFitness,
  taskMatchesPathAllowlist,
} from "./maintainer.js";
import { FULL_ARENA_PROFILE_KEYS } from "./profiles.js";
import { shouldRollMonthlyPeriod } from "./budgets.js";

describe("maintainer policy", () => {
  it("parses defaults when raw is null", () => {
    const p = parseMaintainerPolicy(null);
    assert.equal(p.enabled, false);
    assert.equal(p.monthlyBudgetMicros, DEFAULT_MONTHLY_BUDGET_MICROS);
    assert.equal(DEFAULT_MONTHLY_BUDGET_MICROS, 8_000_000);
    assert.equal(p.maxTournamentN, 2);
    assert.equal(p.autoMerge, true);
    assert.equal(p.autoQueueReplanTasks, true);
    assert.equal(p.maxAutoQueuePerReplan, 2);
    assert.equal(p.continuousBacklog, true);
    assert.equal(p.releaseTagStyle, "daily");
  });

  it("uses lean arena roster when available budget is tight", () => {
    assert.deepEqual(
      rosterKeysForAvailableBudget(LEAN_ROSTER_AVAILABLE_MICROS - 1),
      [...LEAN_ARENA_PROFILE_KEYS],
    );
    assert.deepEqual(
      rosterKeysForAvailableBudget(LEAN_ROSTER_AVAILABLE_MICROS),
      [...FULL_ARENA_PROFILE_KEYS],
    );
  });

  it("refills backlog when idle under budget (continuous)", () => {
    assert.equal(
      shouldReplanVision({
        lastVisionReplanAt: new Date(),
        replanIntervalDays: 7,
        continuousBacklog: true,
        openWorkCount: 0,
        availableMicros: MIN_REPLAN_AVAILABLE_MICROS + 1,
      }),
      true,
    );
    assert.equal(
      shouldReplanVision({
        lastVisionReplanAt: new Date(),
        replanIntervalDays: 7,
        continuousBacklog: true,
        openWorkCount: 2,
        availableMicros: 1_000_000,
      }),
      false,
    );
    assert.equal(
      shouldReplanVision({
        lastVisionReplanAt: new Date(),
        replanIntervalDays: 7,
        continuousBacklog: true,
        openWorkCount: 0,
        availableMicros: MIN_REPLAN_AVAILABLE_MICROS,
      }),
      false,
    );
  });

  it("honors interval when continuous backlog is off", () => {
    const now = Date.UTC(2026, 0, 10);
    assert.equal(
      shouldReplanVision({
        lastVisionReplanAt: new Date(Date.UTC(2026, 0, 9)),
        replanIntervalDays: 7,
        continuousBacklog: false,
        openWorkCount: 0,
        availableMicros: 1_000_000,
        nowMs: now,
      }),
      false,
    );
    assert.equal(
      shouldReplanVision({
        lastVisionReplanAt: new Date(Date.UTC(2026, 0, 1)),
        replanIntervalDays: 7,
        continuousBacklog: false,
        openWorkCount: 3,
        availableMicros: 1_000_000,
        nowMs: now,
      }),
      true,
    );
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

describe("selectCiRefreshRun", () => {
  it("picks WAITING_CI with headSha before tournament WINNER exists", () => {
    const waiting = {
      id: "w",
      status: "WAITING_CI",
      tournamentId: "t1",
      tournamentResult: null,
      headSha: "abc123",
    };
    const cancelled = {
      id: "c",
      status: "CANCELLED",
      tournamentId: "t1",
      tournamentResult: null,
      headSha: null,
    };
    assert.equal(selectCiRefreshRun([cancelled, waiting]), waiting);
  });

  it("prefers WINNER when present", () => {
    const waiting = {
      id: "w",
      status: "WAITING_CI",
      tournamentId: "t1",
      tournamentResult: null,
      headSha: "aaa",
    };
    const winner = {
      id: "win",
      status: "REVIEW_REQUIRED",
      tournamentId: "t1",
      tournamentResult: "WINNER",
      headSha: "bbb",
    };
    assert.equal(selectCiRefreshRun([waiting, winner]), winner);
  });

  it("skips unknown headSha", () => {
    assert.equal(
      selectCiRefreshRun([
        {
          id: "x",
          status: "WAITING_CI",
          tournamentId: null,
          tournamentResult: null,
          headSha: "unknown",
        },
      ]),
      null,
    );
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

describe("auto-merge skip / backoff", () => {
  it("classifies protection, terminal, and transient messages", () => {
    assert.equal(isMergeProtectionBlock("Review is required"), true);
    assert.equal(isTerminalMergeSkip("Pull request is closed"), true);
    assert.equal(
      isTransientNotMergeable("Pull Request is not mergeable"),
      true,
    );
    assert.equal(isTransientNotMergeable("ok to merge"), false);
  });

  it("skips merged and blocked PRs permanently", () => {
    const skip = resolveAutoMergeSkipPrs([
      {
        kind: "auto_merge",
        createdAt: new Date(),
        payload: { prNumber: 1, merged: true, message: "merged" },
      },
      {
        kind: "merge_blocked",
        createdAt: new Date(),
        payload: { prNumber: 2, merged: false, blocked: true, message: "owners" },
      },
    ]);
    assert.ok(skip.has(1));
    assert.ok(skip.has(2));
  });

  it("backs off not-mergeable within cooldown, then allows retry", () => {
    const now = Date.UTC(2026, 9, 25, 12, 0, 0);
    const recent = new Date(now - 5 * 60_000);
    const stale = new Date(now - AUTO_MERGE_RETRY_COOLDOWN_MS - 60_000);

    const skipRecent = resolveAutoMergeSkipPrs(
      [
        {
          kind: "auto_merge",
          createdAt: recent,
          payload: {
            prNumber: 10,
            merged: false,
            message: "Pull Request is not mergeable",
          },
        },
      ],
      now,
    );
    assert.ok(skipRecent.has(10));

    const skipStale = resolveAutoMergeSkipPrs(
      [
        {
          kind: "auto_merge",
          createdAt: stale,
          payload: {
            prNumber: 10,
            merged: false,
            message: "Pull Request is not mergeable",
          },
        },
      ],
      now,
    );
    assert.equal(skipStale.has(10), false);
  });
});
