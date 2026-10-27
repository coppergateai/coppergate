import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  missionControlAttentionKindRank,
  sortMissionControlAttention,
  type MissionControlAttentionItem,
} from "./mission-control-attention.js";

function item(
  kind: MissionControlAttentionItem["kind"],
  id: string,
  priority: MissionControlAttentionItem["priority"] = "high",
): MissionControlAttentionItem {
  return {
    id,
    kind,
    title: id,
    detail: "",
    href: "/",
    priority,
  };
}

describe("mission-control attention (P-101)", () => {
  it("ranks concurrency ahead of provider_quota and merge_blocked", () => {
    assert.ok(
      missionControlAttentionKindRank("concurrency") <
        missionControlAttentionKindRank("provider_quota"),
    );
    assert.ok(
      missionControlAttentionKindRank("provider_quota") <
        missionControlAttentionKindRank("merge_blocked"),
    );
    assert.ok(
      missionControlAttentionKindRank("merge_blocked") <
        missionControlAttentionKindRank("approval"),
    );
  });

  it("sortMissionControlAttention leads with concurrency then provider_quota", () => {
    const rows = [
      item("approval", "a"),
      item("provider_quota", "q"),
      item("arena_failed", "f"),
      item("concurrency", "c"),
      item("merge_blocked", "m"),
    ];
    sortMissionControlAttention(rows);
    assert.deepEqual(
      rows.map((r) => r.kind),
      [
        "concurrency",
        "provider_quota",
        "merge_blocked",
        "approval",
        "arena_failed",
      ],
    );
  });

  it("sortMissionControlAttention prefers high priority within same crisis tier", () => {
    const rows = [
      item("approval", "a-low", "normal"),
      item("approval", "a-high", "high"),
    ];
    sortMissionControlAttention(rows);
    assert.equal(rows[0]?.id, "a-high");
  });
});
