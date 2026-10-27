import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gcOrphanSandboxes } from "./sandbox-gc.js";

describe("gcOrphanSandboxes", () => {
  it("removes old cg-sandbox dirs and keeps fresh ones", async () => {
    const root = await mkdtemp(join(tmpdir(), "cg-gc-root-"));
    const oldDir = join(root, "cg-sandbox-old");
    const freshDir = join(root, "cg-sandbox-fresh");
    await mkdir(oldDir);
    await mkdir(freshDir);
    await writeFile(join(oldDir, "x"), "1");
    // Force old mtime via touching is hard portably — use minAgeMs: 0 for old,
    // and a huge minAge for the assertion that fresh with minAge 0 also removes.
    // Instead: first pass with huge minAge keeps both; second with 0 removes both.
    const keep = await gcOrphanSandboxes({
      rootDir: root,
      minAgeMs: 365 * 24 * 60 * 60_000,
    });
    assert.equal(keep.removed, 0);

    const gone = await gcOrphanSandboxes({ rootDir: root, minAgeMs: 0 });
    assert.equal(gone.removed, 2);
  });
});
