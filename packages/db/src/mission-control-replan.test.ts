import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isReplanArchitectureFetchFailedReason,
  isReplanArchitectureIdleReason,
  isReplanQueueArchitectureIdleMeta,
  missionControlArchitectureFetchFailedItem,
  missionControlReplanIdleItem,
  replanArchitectureIdleCopy,
  replanSkipReasonFromMeta,
} from "./mission-control-replan.js";

describe("mission-control-replan (AG-015)", () => {
  it("recognizes architecture idle skip reasons", () => {
    assert.equal(isReplanArchitectureIdleReason("no_architecture_open_id"), true);
    assert.equal(
      isReplanArchitectureIdleReason("architecture_ids_in_flight"),
      true,
    );
    assert.equal(isReplanArchitectureIdleReason("non_primary_project"), false);
  });

  it("replanSkipReasonFromMeta requires skipped flag", () => {
    assert.equal(
      replanSkipReasonFromMeta({
        skipped: true,
        reason: "no_architecture_open_id",
      }),
      "no_architecture_open_id",
    );
    assert.equal(
      replanSkipReasonFromMeta({ reason: "no_architecture_open_id" }),
      null,
    );
  });

  it("replanArchitectureIdleCopy uses calm operator language", () => {
    const idle = replanArchitectureIdleCopy("no_architecture_open_id", {
      projectLabel: "coppergate",
    });
    assert.match(idle.title, /Open Program idle/i);
    assert.match(idle.title, /coppergate/);
    assert.match(idle.detail, /OPEN_PROGRAM/i);
    assert.doesNotMatch(idle.title, /failed/i);

    const inflight = replanArchitectureIdleCopy("architecture_ids_in_flight", {
      inFlightCount: 2,
    });
    assert.match(inflight.title, /in flight/i);
    assert.match(inflight.detail, /2 architecture IDs/);
  });

  it("missionControlReplanIdleItem is normal priority replan_idle", () => {
    const row = missionControlReplanIdleItem({
      dedupeKey: "p1",
      workspaceId: "ws1",
      projectId: "p1",
      reason: "no_architecture_open_id",
      projectLabel: "Primary",
    });
    assert.equal(row.kind, "replan_idle");
    assert.equal(row.priority, "normal");
    assert.match(row.href, /\/workspaces\/ws1\/backlog/);
  });

  it("architecture fetch failed surfaces re-bind Program path (AG-020)", () => {
    assert.equal(isReplanArchitectureFetchFailedReason("architecture_fetch_failed"), true);
    assert.equal(isReplanArchitectureFetchFailedReason("no_architecture_open_id"), false);
    const row = missionControlArchitectureFetchFailedItem({
      dedupeKey: "p1",
      workspaceId: "ws1",
      projectId: "p1",
      projectLabel: "Primary",
      fetchError: "bad_token",
    });
    assert.equal(row.kind, "architecture_fetch_failed");
    assert.match(row.detail, /will not invent/i);
    assert.match(row.href, /tab=configuration#open-program-bind/);
    assert.equal(row.ctaLabel, "Re-bind Program path");
  });

  it("isReplanQueueArchitectureIdleMeta filters queue_failed noise", () => {
    assert.equal(
      isReplanQueueArchitectureIdleMeta({
        reason: "architecture_ids_in_flight",
      }),
      true,
    );
    assert.equal(
      isReplanQueueArchitectureIdleMeta({
        error: "no_architecture_open_id",
      }),
      true,
    );
    assert.equal(
      isReplanQueueArchitectureIdleMeta({
        error: "community plan allows 1 concurrent run",
      }),
      false,
    );
  });
});
