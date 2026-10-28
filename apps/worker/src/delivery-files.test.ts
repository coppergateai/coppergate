import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertLockfileSyncedWithPackageJson,
  assertProductDeliveryPaths,
  buildDeliveryFiles,
  findOnDiskLockfilePaths,
  lockfilePathForPackageManager,
  lockfileRefreshCommand,
  pathMatchesAllowlist,
} from "./delivery-files.js";

describe("product delivery path gates", () => {
  it("matches apps/** allowlist", () => {
    assert.equal(pathMatchesAllowlist("apps/web/src/x.ts", ["apps/**"]), true);
    assert.equal(pathMatchesAllowlist("arena/roster.go", ["apps/**"]), false);
  });

  it("rejects phantom Go trees under product allowlist", () => {
    const hit = assertProductDeliveryPaths({
      paths: ["arena/roster.go", "internal/programruntime/runtime.go"],
      pathAllowlist: ["apps/**", "packages/**"],
    });
    assert.equal(hit.ok, false);
    if (!hit.ok) assert.equal(hit.code, "phantom_tree");
  });

  it("allows TS product paths", () => {
    const ok = assertProductDeliveryPaths({
      paths: ["packages/db/src/maintainer.ts", "docs/HARNESS.md"],
      pathAllowlist: ["apps/**", "packages/**", "docs/**"],
    });
    assert.equal(ok.ok, true);
  });
});

describe("lockfile sync gate", () => {
  it("allows package.json when lockfile is also in the delivery", () => {
    const ok = assertLockfileSyncedWithPackageJson([
      "packages/db/package.json",
      "pnpm-lock.yaml",
    ]);
    assert.equal(ok.ok, true);
  });

  it("refuses package.json without lockfile", () => {
    const hit = assertLockfileSyncedWithPackageJson([
      "packages/db/package.json",
      "packages/db/src/index.ts",
    ]);
    assert.equal(hit.ok, false);
    if (!hit.ok) assert.equal(hit.code, "lockfile_out_of_sync");
  });

  it("ignores deliveries that do not touch package.json", () => {
    const ok = assertLockfileSyncedWithPackageJson(["packages/db/src/index.ts"]);
    assert.equal(ok.ok, true);
  });

  it("finds on-disk root lockfile omitted from filesChanged", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "cg-lock-"));
    await mkdir(join(workdir, "packages/db"), { recursive: true });
    await writeFile(join(workdir, "packages/db/package.json"), "{}", "utf8");
    await writeFile(join(workdir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    const found = await findOnDiskLockfilePaths(workdir, [
      "packages/db/package.json",
    ]);
    assert.deepEqual(found, ["pnpm-lock.yaml"]);
    assert.equal(
      assertLockfileSyncedWithPackageJson([
        "packages/db/package.json",
        ...found,
      ]).ok,
      true,
    );
  });

  it("lockfile refresh command is argv-safe (no shell -c)", () => {
    assert.deepEqual(lockfileRefreshCommand("pnpm"), [
      "pnpm",
      "install",
      "--lockfile-only",
      "--ignore-scripts",
    ]);
    assert.equal(lockfilePathForPackageManager("pnpm"), "pnpm-lock.yaml");
  });
});

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
