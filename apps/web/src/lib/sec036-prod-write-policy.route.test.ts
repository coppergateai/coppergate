import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

describe("SEC-036 prod write policy gate", () => {
  it("assert script passes", () => {
    const out = execFileSync(
      process.execPath,
      [path.join(repoRoot, "scripts/assert-sec036-prod-write-policy.mjs")],
      { encoding: "utf8" },
    );
    assert.match(out, /SEC-036 OK/);
  });
});
