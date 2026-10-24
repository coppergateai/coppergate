import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatReleaseNotes } from "./release.js";

describe("formatReleaseNotes", () => {
  it("buckets features and fixes for user-facing notes", () => {
    const body = formatReleaseNotes({
      version: "v0.20261024.1",
      highlights: [
        "P-007: Refresh stale default models",
        "fix: nil panic in plan apply",
        "chore: bump deps",
      ],
    });
    assert.match(body, /What's new/);
    assert.match(body, /P-007/);
    assert.match(body, /Fixes/);
    assert.match(body, /nil panic/);
    assert.match(body, /Changes/);
  });
});
