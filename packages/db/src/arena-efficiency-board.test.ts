import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEfficiencyBoard,
  formatWinnerPromoteReason,
  inferCiFailedForPayoff,
} from "./arena-efficiency-board.js";

describe("arena-efficiency-board (P-140)", () => {
  it("inferCiFailedForPayoff detects ci_failed error and f>0 with e=0", () => {
    assert.equal(
      inferCiFailedForPayoff({
        errorCode: "ci_failed",
        fitnessScore: 0.8,
        efficiencyScore: 0,
      }),
      true,
    );
    assert.equal(
      inferCiFailedForPayoff({
        errorCode: null,
        fitnessScore: 0.72,
        efficiencyScore: 0,
      }),
      true,
    );
    assert.equal(
      inferCiFailedForPayoff({
        errorCode: null,
        fitnessScore: 0,
        efficiencyScore: 0,
      }),
      false,
    );
  });

  it("buildEfficiencyBoard ranks by efficiency and marks CI fail", () => {
    const board = buildEfficiencyBoard({
      payoffAlpha: 0.25,
      contenders: [
        {
          id: "c1",
          profileKey: "engineer",
          latestRun: {
            id: "r1",
            status: "REVIEW_REQUIRED",
            taskId: "t1",
            taskTitle: "Fix race",
            actualCostMicros: 2_000_000,
            fitnessScore: 0.9,
            efficiencyScore: 0.85,
            errorCode: null,
            tournamentResult: "WINNER",
            updatedAt: new Date().toISOString(),
          },
        },
        {
          id: "c2",
          profileKey: "reviewer",
          latestRun: {
            id: "r2",
            status: "FAILED",
            taskId: "t1",
            taskTitle: "Fix race",
            actualCostMicros: 1_500_000,
            fitnessScore: 0.7,
            efficiencyScore: 0,
            errorCode: "ci_failed",
            tournamentResult: "LOSER",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
      tournament: {
        taskId: "t1",
        status: "RESOLVED",
        winnerRunId: "r1",
      },
    });

    assert.ok(board);
    assert.equal(board!.rows[0]!.runId, "r1");
    assert.equal(board!.rows[1]!.ciFailed, true);
    assert.equal(board!.rows[1]!.efficiencyScore, 0);
    assert.match(board!.winnerPromoteReason ?? "", /Promoted engineer/);
  });

  it("formatWinnerPromoteReason includes f, spend, and e", () => {
    const reason = formatWinnerPromoteReason({
      profileKey: "prop",
      fitnessScore: 0.91,
      efficiencyScore: 0.412,
      spendMicros: 14_200_000,
      alpha: 0.25,
    });
    assert.match(reason, /e=0\.412/);
    assert.match(reason, /f=0\.91/);
    assert.match(reason, /\$14\.20/);
  });
});
