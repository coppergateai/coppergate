import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDeliveryFiles } from "./delivery-files.js";

describe("buildDeliveryFiles path containment", () => {
  it("reads files inside workdir", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-del-"));
    await mkdir(join(workdir, "app"), { recursive: true });
    await writeFile(join(workdir, "app/page.tsx"), "export default 1", "utf8");
    const result = await buildDeliveryFiles({
      workdir,
      filesChanged: ["app/page.tsx"],
      runId: "r1",
    });
    assert.equal(result.fromSandbox, 1);
    assert.equal(result.files[0]?.content, "export default 1");
  });

  it("ignores path traversal attempts", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-del-"));
    const outside = join(workdir, "..", "secret.txt");
    await writeFile(outside, "leaked", "utf8");
    const result = await buildDeliveryFiles({
      workdir,
      filesChanged: ["../secret.txt", "app/../../secret.txt"],
      runId: "r1",
    });
    assert.equal(result.fromSandbox, 0);
    assert.equal(result.files.length, 0);
  });
});
