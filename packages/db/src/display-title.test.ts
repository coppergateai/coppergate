import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayTaskTitle } from "./display-title.js";

describe("displayTaskTitle", () => {
  it("strips bold and markdown links", () => {
    const raw =
      "good first issue: P-007: **Refresh stale default models** Hygiene [provider-tasks/TASK007.md](./provider-tasks/TASK007.md)";
    assert.equal(
      displayTaskTitle(raw),
      "good first issue: P-007: Refresh stale default models Hygiene provider-tasks/TASK007.md",
    );
  });

  it("truncates long titles", () => {
    const long = "a".repeat(120);
    const out = displayTaskTitle(long, 40);
    assert.equal(out.length, 40);
    assert.ok(out.endsWith("…"));
  });

  it("handles empty input", () => {
    assert.equal(displayTaskTitle(null), "");
    assert.equal(displayTaskTitle("   "), "");
  });
});
