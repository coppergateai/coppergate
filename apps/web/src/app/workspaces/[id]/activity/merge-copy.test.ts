import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type ActivityEvent,
  groupActivityEvents,
  shipGateHaltTitle,
} from "./events.js";

function evt(
  partial: Partial<ActivityEvent> & Pick<ActivityEvent, "id" | "action">,
): ActivityEvent {
  return {
    actor: "system:maintainer",
    targetType: "project",
    targetId: "p1",
    meta: null,
    href: null,
    createdAt: "2026-11-09T14:00:00.000Z",
    ...partial,
  };
}

describe("merge activity copy follows the real reason", () => {
  it("ship-gate halt title follows meta.reason", () => {
    assert.equal(
      shipGateHaltTitle({ reason: "default_branch_ci_pending" }),
      "Auto-merge waiting on tip CI",
    );
    assert.equal(
      shipGateHaltTitle({ reason: "open_ship_rollback" }),
      "Auto-merge halted (ship rollback open)",
    );
    assert.equal(
      shipGateHaltTitle({ reason: "default_branch_ci_red" }),
      "Auto-merge halted (CI red)",
    );
  });

  it("a pending tip CI halt is not shown as a failure", () => {
    const [group] = groupActivityEvents([
      evt({
        id: "h1",
        action: "merge.halted_ci_red",
        meta: { projectId: "p1", reason: "default_branch_ci_pending" },
      }),
    ]);
    const child = group!.children[0] ?? group!;
    assert.equal(child.title, "Auto-merge waiting on tip CI");
    assert.notEqual(child.outcome, "failed");
  });

  it("a not-yet-reported required check reads as waiting, not blocked", () => {
    const [group] = groupActivityEvents([
      evt({
        id: "m1",
        action: "merge.attempt",
        targetType: "merge",
        meta: {
          projectId: "p1",
          prNumber: 224,
          merged: false,
          blocked: false,
          message: 'Required status check "check" is expected.',
        },
      }),
    ]);
    const child = group!.children[0] ?? group!;
    assert.equal(child.title, "Waiting on required checks");
    assert.equal(child.outcome, "review");
  });
});
