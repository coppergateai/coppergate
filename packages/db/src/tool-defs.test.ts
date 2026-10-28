import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CORE_ALLOWLIST_TOOLS,
  RESERVED_TOOL_KEYS,
  isValidToolDefKey,
  isWorkspaceToolDefKind,
  normalizeToolDefKey,
} from "./tool-defs.js";

describe("tool-defs helpers", () => {
  it("normalizes and validates keys", () => {
    assert.equal(normalizeToolDefKey(" My Tool "), "my-tool");
    assert.equal(isValidToolDefKey("my-tool"), true);
    assert.equal(isValidToolDefKey("mcp:custom"), true);
    assert.equal(isValidToolDefKey("read"), false);
    assert.equal(isValidToolDefKey("mcp:*"), false);
    assert.equal(isValidToolDefKey(""), false);
  });

  it("recognizes kinds and reserved core set", () => {
    assert.equal(isWorkspaceToolDefKind("custom"), true);
    assert.equal(isWorkspaceToolDefKind("alias"), true);
    assert.equal(isWorkspaceToolDefKind("mcp"), true);
    assert.equal(isWorkspaceToolDefKind("shell"), false);
    assert.ok(RESERVED_TOOL_KEYS.has("edit"));
    assert.ok(RESERVED_TOOL_KEYS.has("sonar_quality_gate"));
    assert.ok(CORE_ALLOWLIST_TOOLS.has("git"));
    assert.ok(CORE_ALLOWLIST_TOOLS.has("mcp:*"));
    assert.equal(isValidToolDefKey("sonar_list_issues"), false);
  });
});
