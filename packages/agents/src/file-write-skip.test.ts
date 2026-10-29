import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterProposedWritesAgainstCompleted,
  sha256Utf8,
} from "./file-write-skip.js";

describe("file-write-skip (AG-014)", () => {
  it("skips matching fingerprints only", () => {
    const completed = [
      { path: "a.ts", contentSha256: sha256Utf8("one") },
    ];
    const { toWrite, skipped } = filterProposedWritesAgainstCompleted(
      [
        { path: "a.ts", content: "one" },
        { path: "a.ts", content: "two" },
        { path: "b.ts", content: "x" },
      ],
      completed,
    );
    assert.deepEqual(skipped, ["a.ts"]);
    assert.deepEqual(
      toWrite.map((f) => `${f.path}:${f.content}`),
      ["a.ts:two", "b.ts:x"],
    );
  });
});
