import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterMcpToolsForProfile } from "./mcp.js";

describe("filterMcpToolsForProfile", () => {
  const tools = ["sonar_list_issues", "sonar_quality_gate"];

  it("returns empty when profile has no mcp access", () => {
    assert.deepEqual(
      filterMcpToolsForProfile({
        provider: "sonarqube",
        connectionTools: tools,
        profileToolAllowlist: ["read", "edit"],
      }),
      [],
    );
  });

  it("allows provider tag", () => {
    assert.deepEqual(
      filterMcpToolsForProfile({
        provider: "sonarqube",
        connectionTools: tools,
        profileToolAllowlist: ["read", "mcp:sonarqube"],
      }),
      tools,
    );
  });

  it("intersects named tools", () => {
    assert.deepEqual(
      filterMcpToolsForProfile({
        provider: "sonarqube",
        connectionTools: tools,
        profileToolAllowlist: ["sonar_list_issues"],
      }),
      ["sonar_list_issues"],
    );
  });
});
