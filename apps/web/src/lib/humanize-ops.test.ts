import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanizeOpsDetail } from "./humanize-ops.js";

describe("humanizeOpsDetail", () => {
  it("softens concurrency plan errors", () => {
    assert.match(
      humanizeOpsDetail(
        "community plan allows 1 concurrent run(s) per project; 1 in flight on this project — wait or pause Arena",
      ),
      /already in flight/i,
    );
  });

  it("passes through short human messages", () => {
    assert.equal(humanizeOpsDetail("Merge blocked by reviews"), "Merge blocked by reviews");
  });
});
