import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFileWriteCheckpointEntry,
  FILE_WRITE_CHECKPOINT_MAX_BYTES,
  filterProposedWritesAgainstCheckpoint,
  hashFileWriteContent,
  mergeFileWriteCheckpoint,
  parseFileWriteCheckpoint,
  restorableWritePaths,
} from "./file-write-checkpoint.js";

describe("file-write-checkpoint (AG-014)", () => {
  it("hashes content stably", () => {
    assert.equal(
      hashFileWriteContent("hello"),
      hashFileWriteContent("hello"),
    );
    assert.notEqual(
      hashFileWriteContent("hello"),
      hashFileWriteContent("hello!"),
    );
  });

  it("omits oversized content bodies", () => {
    const big = "x".repeat(FILE_WRITE_CHECKPOINT_MAX_BYTES + 1);
    const entry = buildFileWriteCheckpointEntry("src/big.ts", big);
    assert.equal(entry.content, undefined);
    assert.equal(entry.contentSha256, hashFileWriteContent(big));
  });

  it("merge last-write-wins per path", () => {
    const first = mergeFileWriteCheckpoint(null, {
      runId: "r1",
      taskId: "t1",
      writes: [
        { path: "a.ts", content: "1" },
        { path: "b.ts", content: "2" },
      ],
    });
    const second = mergeFileWriteCheckpoint(first, {
      runId: "r1",
      taskId: "t1",
      writes: [{ path: "a.ts", content: "1b" }],
    });
    assert.equal(second.files.length, 2);
    const a = second.files.find((f) => f.path === "a.ts");
    assert.equal(a?.content, "1b");
  });

  it("skips identical proposed writes; allows content change", () => {
    const cp = mergeFileWriteCheckpoint(null, {
      runId: "r1",
      taskId: "t1",
      writes: [{ path: "a.ts", content: "same" }],
    });
    const identical = filterProposedWritesAgainstCheckpoint(
      [
        { path: "a.ts", content: "same" },
        { path: "b.ts", content: "new" },
      ],
      cp,
    );
    assert.deepEqual(identical.skipped, ["a.ts"]);
    assert.deepEqual(
      identical.toWrite.map((f) => f.path),
      ["b.ts"],
    );

    const changed = filterProposedWritesAgainstCheckpoint(
      [{ path: "a.ts", content: "different" }],
      cp,
    );
    assert.deepEqual(changed.skipped, []);
    assert.equal(changed.toWrite[0]?.content, "different");
  });

  it("parse rejects wrong kind; restorable needs content", () => {
    assert.equal(parseFileWriteCheckpoint({ kind: "other" }), null);
    const withBody = mergeFileWriteCheckpoint(null, {
      runId: "r",
      taskId: "t",
      writes: [{ path: "ok.ts", content: "x" }],
    });
    assert.deepEqual(restorableWritePaths(withBody), ["ok.ts"]);
    const parsed = parseFileWriteCheckpoint({
      kind: "file_write_checkpoint",
      runId: "r",
      taskId: "t",
      files: [{ path: "sha-only.ts", contentSha256: "abc" }],
    });
    assert.deepEqual(restorableWritePaths(parsed), []);
  });
});
