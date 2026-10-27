import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsForbiddenWriteSecret,
  evaluateAgentWritePath,
  isAgentWritePathAllowed,
  isForbiddenAgentPath,
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
    assert.equal(isSafeRelativePath("app/%2e%2e/secret"), false);
  });

  it("SEC-022 forbids env, secret files, and .git paths even under **/*", () => {
    assert.equal(isForbiddenAgentPath("apps/web/.env"), true);
    assert.equal(isForbiddenAgentPath("apps/web/.env.local"), true);
    assert.equal(isForbiddenAgentPath("apps/web/.env.example"), false);
    assert.equal(isForbiddenAgentPath("packages/db/credentials.json"), true);
    assert.equal(isForbiddenAgentPath(".git/config"), true);
    assert.equal(isForbiddenAgentPath(".fly/config.yml"), true);
    assert.equal(
      isAgentWritePathAllowed("apps/web/.env", ["**/*", "apps/**"]),
      false,
    );
    assert.equal(isAgentWritePathAllowed("apps/web/page.tsx", ["apps/**"]), true);
  });

  it("SEC-022 detects embedded secrets and Fly tokens in file content", () => {
    assert.equal(
      containsForbiddenWriteSecret("FLY_API_TOKEN=fo1_deadbeef0123456789"),
      true,
    );
    assert.equal(
      containsForbiddenWriteSecret("export const x = 1;\n"),
      false,
    );
    const gate = evaluateAgentWritePath({
      path: "apps/web/src/config.ts",
      allowedPaths: ["apps/**"],
      content: "const t = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';",
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.code, "forbidden_secret");
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
    // Path globs must not block edits (legacy confusion with allowedPaths).
    assert.equal(isEditToolAllowed({ toolAllowlist: ["**/*"] }), true);
    assert.equal(
      isEditToolAllowed({
        toolAllowlist: ["**/*"],
        profileTools: ["read", "edit", "git"],
      }),
      true,
    );
  });
});
