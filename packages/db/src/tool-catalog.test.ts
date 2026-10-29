import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SYSTEM_TOOL_CATALOG, systemToolMeta } from "./tool-catalog.js";

describe("system tool catalog", () => {
  it("includes core, mcp grant, invokable sonar, and write aliases", () => {
    const keys = new Set(SYSTEM_TOOL_CATALOG.map((t) => t.key));
    for (const k of [
      "read",
      "edit",
      "test",
      "git",
      "mcp:*",
      "mcp:sonarqube",
      "mcp:mcp",
      "sonar_list_issues",
      "sonar_quality_gate",
      "sonar_hotspots",
      "write",
      "write_file",
      "put_file",
    ]) {
      assert.ok(keys.has(k), `missing tool ${k}`);
    }
  });

  it("keeps descriptions as markdown playbooks under UI budget", () => {
    for (const t of SYSTEM_TOOL_CATALOG) {
      assert.ok(t.description.includes("# "), `${t.key} missing title heading`);
      assert.ok(
        t.description.includes("## Hard rules"),
        `${t.key} missing Hard rules`,
      );
      assert.ok(t.description.length > 80, t.key);
      assert.ok(
        t.description.length <= 2_000,
        `${t.key} too long (${t.description.length})`,
      );
    }
  });

  it("marks only sonar_* catalog entries as invokable", () => {
    for (const t of SYSTEM_TOOL_CATALOG) {
      if (t.key.startsWith("sonar_")) {
        assert.equal(t.invokable, true, t.key);
      } else {
        assert.equal(t.invokable, false, t.key);
      }
    }
  });

  it("systemToolMeta resolves known and synthesizes unknown", () => {
    assert.equal(systemToolMeta("git").title, "Git");
    assert.equal(systemToolMeta("sonar_custom_rule").invokable, true);
    assert.equal(systemToolMeta("mcp:acme").kind, "mcp");
    assert.equal(systemToolMeta("mystery").kind, "core");
  });
});
