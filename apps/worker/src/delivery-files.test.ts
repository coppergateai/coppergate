import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDeliveryFiles } from "./delivery-files.js";

describe("buildDeliveryFiles", () => {
  it("reads sandbox workdir content and skips missing README", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-deliv-"));
    await mkdir(join(workdir, "app"), { recursive: true });
    await writeFile(
      join(workdir, "app/page.tsx"),
      "export default function Page() { return null; }\n",
      "utf8",
    );

    const { files, fromSandbox } = await buildDeliveryFiles({
      workdir,
      filesChanged: ["app/page.tsx", "README.md"],
      runId: "run-1",
    });

    assert.equal(fromSandbox, 1);
    assert.equal(files.length, 1);
    assert.equal(files[0]!.path, "app/page.tsx");
    assert.match(files[0]!.content, /export default function Page/);
  });

  it("returns empty when path missing from sandbox — never invents stubs", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-deliv-"));
    const { files, fromSandbox } = await buildDeliveryFiles({
      workdir,
      filesChanged: ["src/missing.ts"],
      runId: "run-2",
    });
    assert.equal(fromSandbox, 0);
    assert.equal(files.length, 0);
  });

  it("returns empty when workdir missing", async () => {
    const { files, fromSandbox } = await buildDeliveryFiles({
      workdir: null,
      filesChanged: ["app/page.tsx"],
      runId: "run-3",
    });
    assert.equal(fromSandbox, 0);
    assert.equal(files.length, 0);
  });
});
