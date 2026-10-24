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
});
