import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPathAllowed,
  isEditToolAllowed,
  isProfileEditAllowed,
  isSafeRelativePath,
  resolveSafeWorkdirPath,
} from "./path-policy.js";

describe("path-policy", () => {
  it("rejects traversal and absolute paths", () => {
    assert.equal(isSafeRelativePath("../etc/passwd"), false);
    assert.equal(isSafeRelativePath("/etc/passwd"), false);
    assert.equal(isSafeRelativePath("app/../../secret"), false);
    assert.equal(isSafeRelativePath("app/page.tsx"), true);
  });

  it("enforces allowedPaths when non-empty", () => {
    assert.equal(isPathAllowed("app/page.tsx", ["app"]), true);
    assert.equal(isPathAllowed("app/page.tsx", ["app/page.tsx"]), true);
    assert.equal(isPathAllowed("lib/util.ts", ["app"]), false);
    assert.equal(isPathAllowed("app/page.tsx", []), true);
    assert.equal(isPathAllowed("app/page.tsx", ["**/*"]), true);
    assert.equal(isPathAllowed("app/page.tsx", ["app/**"]), true);
    assert.equal(isPathAllowed("../etc/passwd", ["**/*"]), false);
  });

  it("resolves only paths inside workdir", () => {
    const workdir = "/tmp/sandbox-run";
    assert.ok(resolveSafeWorkdirPath(workdir, "src/a.ts")?.startsWith(workdir));
    assert.equal(resolveSafeWorkdirPath(workdir, "../escape.ts"), null);
  });

  it("gates FILE writes via profileTools", () => {
    assert.equal(isProfileEditAllowed(undefined), true);
    assert.equal(isProfileEditAllowed([]), true);
    assert.equal(isProfileEditAllowed(["read"]), false);
    assert.equal(isProfileEditAllowed(["read", "edit"]), true);
    assert.equal(isProfileEditAllowed(["*"]), true);
  });

  it("gates FILE writes via run toolAllowlist", () => {
    assert.equal(isEditToolAllowed({}), true);
    assert.equal(isEditToolAllowed({ toolAllowlist: [] }), true);
    assert.equal(isEditToolAllowed({ toolAllowlist: ["read"] }), false);
    assert.equal(
      isEditToolAllowed({ toolAllowlist: ["read", "write_file"] }),
      true,
    );
    assert.equal(
      isEditToolAllowed({
        toolAllowlist: ["write"],
        profileTools: ["read"],
      }),
      false,
    );
  });
});
