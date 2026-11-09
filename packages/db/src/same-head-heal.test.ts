import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectAutoAcceptRun } from "./maintainer.js";
import {
  SAME_HEAD_MAX_ATTEMPTS,
  buildSameHeadHealPrompt,
  decideSameHeadHeal,
  isSameHeadRun,
  sameHeadIdempotencyKey,
} from "./same-head-heal.js";
import { canTransition } from "./task-sm.js";

const delivered = {
  status: "WAITING_CI",
  errorCode: "ci_failed",
  prNumber: 231,
  branchName: "chore/cg-task-2b21e291",
  headSha: "24ad8eef0000",
};

const base = {
  reason: "ci_failure" as const,
  taskStatus: "WAITING_CI",
  candidate: delivered,
  priorAttempts: 0,
  hasActiveRun: false,
  arenaStatus: "RUNNING",
  flakeSuppressed: false,
};

describe("same-head heal gate", () => {
  it("arms a red delivery PR with attempt 1", () => {
    assert.deepEqual(decideSameHeadHeal(base), { arm: true, attempt: 1 });
  });

  it("refuses with an explicit reason", () => {
    const skip = (over: Partial<typeof base>) => {
      const d = decideSameHeadHeal({ ...base, ...over });
      return d.arm ? "armed" : d.skip;
    };
    assert.equal(skip({ taskStatus: "REVIEW_REQUIRED" }), "task_not_delivered");
    assert.equal(skip({ candidate: { ...delivered, prNumber: null } }), "no_delivery_pr");
    assert.equal(skip({ candidate: { ...delivered, headSha: "unknown" } }), "no_delivery_pr");
    assert.equal(skip({ candidate: { ...delivered, errorCode: null } }), "not_failing");
    assert.equal(skip({ hasActiveRun: true }), "active_run");
    assert.equal(skip({ arenaStatus: "PAUSED" }), "arena_paused");
    assert.equal(skip({ arenaStatus: "KILLED" }), "arena_paused");
    assert.equal(skip({ flakeSuppressed: true }), "flake_cooldown");
    assert.equal(skip({ priorAttempts: SAME_HEAD_MAX_ATTEMPTS }), "exhausted");
  });

  it("stale delivery heals from REVIEW_REQUIRED without a ci_failed code", () => {
    assert.deepEqual(
      decideSameHeadHeal({
        ...base,
        reason: "stale_delivery",
        taskStatus: "REVIEW_REQUIRED",
        candidate: { ...delivered, status: "REVIEW_REQUIRED", errorCode: "waiting_ci_timeout" },
        priorAttempts: 1,
      }),
      { arm: true, attempt: 2 },
    );
  });

  it("allows WAITING_CI / REVIEW_REQUIRED → QUEUED for the heal run", () => {
    assert.equal(canTransition("WAITING_CI", "QUEUED"), true);
    assert.equal(canTransition("REVIEW_REQUIRED", "QUEUED"), true);
  });

  it("auto-accept picks the newest same-head run over the superseded winner", () => {
    const key = sameHeadIdempotencyKey({ prNumber: 231, headSha: "24ad8eef" });
    assert.equal(isSameHeadRun({ idempotencyKey: key }), true);
    const runs = [
      { id: "heal", idempotencyKey: key, status: "REVIEW_REQUIRED", tournamentId: null, tournamentResult: null, prNumber: 231, headSha: "b" },
      { id: "orig", idempotencyKey: "task:t:attempt:1", status: "FAILED", tournamentId: "t1", tournamentResult: "WINNER", prNumber: 231, headSha: "a" },
    ];
    assert.equal(selectAutoAcceptRun(runs)?.id, "heal");
    // Without a same-head run the live WINNER still wins.
    const plain = [
      { ...runs[1]!, status: "REVIEW_REQUIRED" },
      { ...runs[1]!, id: "peer", tournamentResult: "LOSER" },
    ];
    assert.equal(selectAutoAcceptRun(plain)?.id, "orig");
  });

  it("prompt names the head, failing checks, and check output", () => {
    const text = buildSameHeadHealPrompt(
      {
        reason: "ci_failure",
        prNumber: 231,
        headRef: "chore/cg-task-2b21e291",
        headSha: "24ad8eef0000",
        attempt: 1,
        maxAttempts: 2,
        supersededRunId: "r1",
        failingChecks: [{ name: "check", conclusion: "failure", detailsUrl: "https://x/job/9" }],
      },
      { checkOutput: "no-unused-vars: LEAN_ROSTER_AVAILABLE_MICROS" },
    );
    assert.match(text, /PR #231, attempt 1\/2/);
    assert.match(text, /chore\/cg-task-2b21e291/);
    assert.match(text, /`check`: failure/);
    assert.match(text, /LEAN_ROSTER_AVAILABLE_MICROS/);
  });
});
