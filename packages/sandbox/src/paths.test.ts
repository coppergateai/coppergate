import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  SandboxPathError,
  containedRelativePath,
  resolveContainedPath,
} from "./paths.js";

describe("resolveContainedPath", () => {
  const workdir = "/tmp/coppergate-sandbox-run";

  it("resolves safe relative paths", () => {
    assert.equal(
      resolveContainedPath(workdir, "app/page.tsx"),
      join(workdir, "app/page.tsx"),
    );
    assert.equal(
      resolveContainedPath(workdir, "./src/index.ts"),
      join(workdir, "src/index.ts"),
    );
  });

  it("rejects parent traversal", () => {
    assert.throws(
      () => resolveContainedPath(workdir, "../etc/passwd"),
      (err: unknown) => err instanceof SandboxPathError,
    );
    assert.throws(
      () => resolveContainedPath(workdir, "app/../../etc/passwd"),
      (err: unknown) => err instanceof SandboxPathError,
    );
    assert.equal(containedRelativePath(workdir, "../../secret"), null);
  });

  it("rejects absolute paths and null bytes", () => {
    assert.throws(
      () => resolveContainedPath(workdir, "/etc/passwd"),
      (err: unknown) => err instanceof SandboxPathError,
    );
    assert.throws(
      () => resolveContainedPath(workdir, "app/\0x"),
      (err: unknown) => err instanceof SandboxPathError,
    );
  });
});
