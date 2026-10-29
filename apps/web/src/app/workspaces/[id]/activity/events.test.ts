import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type ActivityEvent,
  groupActivityEvents,
  humanTitle,
  summaryFor,
} from "./events.js";

function evt(
  partial: Partial<ActivityEvent> & Pick<ActivityEvent, "id" | "action">,
): ActivityEvent {
  return {
    actor: "system:maintainer",
    targetType: null,
    targetId: null,
    meta: null,
    href: null,
    createdAt: "2026-10-24T14:00:00.000Z",
    ...partial,
  };
}

describe("activity events", () => {
  it("uses human-readable titles", () => {
    assert.equal(
      humanTitle("maintainer.self_improve"),
      "Self-improvement initiated",
    );
    assert.equal(
      humanTitle("signal.spawn_profiles"),
      "Agent profiles spawned",
    );
    assert.equal(
      humanTitle("maintainer.meta_tournament"),
      "Tournament completed",
    );
  });

  it("summarizes spawn profiles from meta only", () => {
    assert.match(
      summaryFor("signal.spawn_profiles", { profileKeys: ["a", "b"] }, 1) ?? "",
      /a, b/,
    );
    assert.equal(
      summaryFor("signal.spawn_profiles", null, 1),
      "New contenders entered the evaluation workflow.",
    );
  });

  it("groups tournament create/fanout/resolve under one execution", () => {
    const tid = "tourn-1";
    const groups = groupActivityEvents([
      evt({
        id: "3",
        action: "tournament.resolve",
        targetType: "tournament",
        targetId: tid,
        createdAt: "2026-10-24T14:10:00.000Z",
        meta: { winnerRunId: "run-1", mechanism: "efficiency_payoff" },
      }),
      evt({
        id: "2",
        action: "tournament.fanout",
        targetType: "tournament",
        targetId: tid,
        createdAt: "2026-10-24T14:05:00.000Z",
        meta: { n: 2, runIds: ["r1", "r2"] },
      }),
      evt({
        id: "1",
        action: "tournament.create",
        targetType: "tournament",
        targetId: tid,
        createdAt: "2026-10-24T14:00:00.000Z",
        meta: { n: 2 },
      }),
      evt({
        id: "x",
        action: "task.enqueue",
        createdAt: "2026-10-24T13:59:00.000Z",
      }),
    ]);

    const tournament = groups.find((g) => g.kind === "execution");
    assert.ok(tournament);
    assert.equal(tournament.title, "Tournament completed");
    assert.equal(tournament.children.length, 3);
    assert.ok(groups.some((g) => g.action === "task.enqueue"));
  });

  it("summarizes run LLM debit with provider and model", () => {
    assert.match(
      summaryFor("run.llm_debit", {
        providerRole: "fallback",
        provider: "cursor_local",
        model: "composer",
        costMicros: 250_000,
      }) ?? "",
      /Fallback cursor_local\/composer/,
    );
    assert.match(
      summaryFor("run.llm_debit", {
        providerRole: "primary",
        provider: "openai_compatible",
        model: "gpt-4o-mini",
        costMicros: 50_000,
      }) ?? "",
      /Primary openai_compatible/,
    );
  });

  it("summarizes contender debit and elimination from meta", () => {
    assert.match(
      summaryFor("contender.debit", {
        profileKey: "engineer",
        debitMicros: 250_000,
        remainingMicros: 750_000,
      }) ?? "",
      /engineer lost/,
    );
    assert.match(
      summaryFor("contender.eliminated", {
        profileKey: "reviewer",
        debitMicros: 50_000,
      }) ?? "",
      /reviewer eliminated/,
    );
    assert.match(
      summaryFor("tournament.fanout", {
        n: 1,
        requestedFanout: 2,
        eligibleCount: 1,
        eliminatedInPool: 2,
        poolStarved: true,
        poolStarvedReason: "contenders",
      }) ?? "",
      /only 1 contender/,
    );
  });

  it("collapses consecutive eliminations across contenders", () => {
    const groups = groupActivityEvents([
      evt({
        id: "a",
        action: "contender.eliminated",
        targetType: "contender",
        targetId: "c1",
        createdAt: "2026-10-24T14:05:00.000Z",
      }),
      evt({
        id: "b",
        action: "contender.eliminated",
        targetType: "contender",
        targetId: "c2",
        createdAt: "2026-10-24T14:04:00.000Z",
      }),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.count, 2);
    assert.match(groups[0]!.technicalLabel, /×2/);
    assert.match(groups[0]!.summary ?? "", /2 candidates/);
  });

  it("collapses consecutive fitness.score storms", () => {
    const groups = groupActivityEvents([
      evt({
        id: "f1",
        action: "fitness.score",
        targetType: "run",
        targetId: "r1",
        createdAt: "2026-10-25T18:58:00.000Z",
      }),
      evt({
        id: "f2",
        action: "fitness.score",
        targetType: "run",
        targetId: "r2",
        createdAt: "2026-10-25T18:57:00.000Z",
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.count, 2);
    assert.match(groups[0]!.technicalLabel, /×2/);
  });

  it("collapses merge.attempt storms per project even when interleaved", () => {
    const projectId = "proj-examples";
    const groups = groupActivityEvents([
      evt({
        id: "m1",
        action: "merge.attempt",
        targetType: "merge",
        targetId: "t1",
        createdAt: "2026-10-25T06:41:55.000Z",
        meta: {
          projectId,
          merged: false,
          message: "Pull Request is not mergeable",
        },
      }),
      evt({
        id: "x",
        action: "task.enqueue",
        createdAt: "2026-10-25T06:41:54.000Z",
      }),
      evt({
        id: "m2",
        action: "merge.attempt",
        targetType: "merge",
        targetId: "t2",
        createdAt: "2026-10-25T06:41:53.000Z",
        meta: {
          projectId,
          merged: true,
          message: "Pull Request successfully merged",
        },
      }),
      evt({
        id: "m3",
        action: "merge.attempt",
        targetType: "merge",
        targetId: "t3",
        createdAt: "2026-10-25T06:41:52.000Z",
        meta: {
          projectId,
          merged: false,
          message: "Pull Request is not mergeable",
        },
      }),
    ]);

    const merge = groups.find((g) => g.action === "merge.attempt");
    assert.ok(merge);
    assert.equal(merge.count, 3);
    assert.equal(merge.title, "Merge activity");
    assert.equal(merge.outcome, "review");
    assert.match(merge.summary ?? "", /1 merged/);
    assert.ok(groups.some((g) => g.action === "task.enqueue"));
  });

  it("collapses interleaved arena control into one group", () => {
    const groups = groupActivityEvents([
      evt({
        id: "a1",
        action: "arena.pause",
        createdAt: "2026-10-25T19:17:03.000Z",
      }),
      evt({
        id: "x",
        action: "task.enqueue",
        createdAt: "2026-10-25T19:17:02.000Z",
      }),
      evt({
        id: "a2",
        action: "arena.stop",
        createdAt: "2026-10-25T19:17:01.000Z",
      }),
      evt({
        id: "a3",
        action: "arena.start",
        createdAt: "2026-10-25T19:17:00.000Z",
      }),
    ]);
    const control = groups.find((g) => g.action === "arena.control");
    assert.ok(control);
    assert.equal(control.count, 3);
    assert.equal(control.title, "Arena control");
    assert.match(control.summary ?? "", /pause/);
    assert.ok(groups.some((g) => g.action === "task.enqueue"));
  });

  it("summarizes backlog replan from stored meta", () => {
    assert.match(
      summaryFor(
        "maintainer.replan",
        {
          taskCount: 1,
          queued: 1,
          architectureId: "P-010",
          architectureTitle: "Ship receipts",
        },
        1,
      ) ?? "",
      /Queued 1 of 1 from P-010 · Ship receipts/,
    );
    assert.match(
      summaryFor(
        "maintainer.replan",
        {
          skipped: true,
          reason: "architecture_ids_in_flight",
          excludeIds: ["P-010", "P-011"],
        },
        1,
      ) ?? "",
      /2 architecture ID/,
    );
    assert.match(
      summaryFor(
        "maintainer.replan",
        { skipped: true, reason: "no_architecture_open_id" },
        1,
      ) ?? "",
      /no open architecture ID/i,
    );
  });

  it("softens concurrency replan queue failures to waiting-on-capacity", () => {
    const groups = groupActivityEvents([
      evt({
        id: "rq",
        action: "maintainer.replan_queue_failed",
        meta: {
          error:
            "community plan allows 1 concurrent run(s) per project; 1 in flight on this project — wait or pause Arena",
        },
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.title, "Waiting on capacity");
    assert.equal(groups[0]!.outcome, "review");
    assert.match(groups[0]!.summary ?? "", /already in flight/i);
  });

  it("collapses replan queue failures per project", () => {
    const projectId = "proj-kprompt";
    const groups = groupActivityEvents([
      evt({
        id: "rq1",
        action: "maintainer.replan_queue_failed",
        createdAt: "2026-10-25T20:16:45.000Z",
        meta: {
          projectId,
          error: "community plan allows 1 concurrent run(s) per project",
        },
      }),
      evt({
        id: "rq2",
        action: "maintainer.replan_queue_failed",
        createdAt: "2026-10-25T20:16:40.000Z",
        meta: {
          projectId,
          error: "community plan allows 1 concurrent run(s) per project",
        },
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.count, 2);
    assert.equal(groups[0]!.title, "Waiting on capacity");
  });
});
