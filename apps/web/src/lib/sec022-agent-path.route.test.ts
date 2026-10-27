import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

describe("SEC-022 agent path allowlist hygiene", () => {
  it("static assert: forbidden paths, secrets, and sandbox containment", () => {
    const out = execFileSync(
      "node",
      [path.join(repoRoot, "scripts/assert-sec022-agent-path-allowlist.mjs")],
      { stdio: "pipe", encoding: "utf8" },
    );
    assert.match(out, /SEC-022 OK/);
  });
});
