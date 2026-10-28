/** Canonical tool tokens used in agent profile allowlists. */
export type ToolCatalogEntry = {
  key: string;
  title: string;
  kind: "core" | "mcp" | "alias";
  description: string;
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    key: "read",
    title: "Read",
    kind: "core",
    description:
      "Read files and inspect the sandbox worktree. Always safe; no mutation.",
  },
  {
    key: "edit",
    title: "Edit",
    kind: "core",
    description:
      "Write or patch files in the sandbox. Required for delivery that changes code.",
  },
  {
    key: "test",
    title: "Test",
    kind: "core",
    description:
      "Run project tests / validation commands inside the sandbox before review.",
  },
  {
    key: "git",
    title: "Git",
    kind: "core",
    description:
      "Branch, commit, and prepare SCM diffs for delivery. Does not bypass path policy.",
  },
  {
    key: "mcp:*",
    title: "MCP · all",
    kind: "mcp",
    description:
      "Allow every connected MCP provider’s tools for this profile. Prefer narrower mcp:… or sonar_* grants when possible.",
  },
  {
    key: "mcp:sonarqube",
    title: "MCP · SonarQube",
    kind: "mcp",
    description:
      "All tools from a connected SonarQube MCP connector (issues, quality gate, hotspots).",
  },
  {
    key: "sonar_list_issues",
    title: "Sonar · list issues",
    kind: "mcp",
    description:
      "List open SonarQube issues for the bound project. Requires an enabled SonarQube MCP connection.",
  },
  {
    key: "sonar_quality_gate",
    title: "Sonar · quality gate",
    kind: "mcp",
    description:
      "Read the SonarQube quality-gate status used for fitness / ship evidence.",
  },
  {
    key: "sonar_hotspots",
    title: "Sonar · hotspots",
    kind: "mcp",
    description:
      "Fetch SonarQube security hotspots for review by fixer / security profiles.",
  },
  {
    key: "write",
    title: "Write (alias)",
    kind: "alias",
    description:
      "Legacy write token treated like edit for FILE write gates.",
  },
  {
    key: "write_file",
    title: "Write file (alias)",
    kind: "alias",
    description:
      "Legacy write_file token treated like edit for FILE write gates.",
  },
  {
    key: "put_file",
    title: "Put file (alias)",
    kind: "alias",
    description:
      "Legacy put_file token treated like edit for FILE write gates.",
  },
];

export function toolMeta(key: string): ToolCatalogEntry {
  const known = TOOL_CATALOG.find((t) => t.key === key);
  if (known) return known;
  if (key.startsWith("sonar_")) {
    const label = key.slice("sonar_".length).replaceAll("_", " ");
    return {
      key,
      title: `Sonar · ${label}`,
      kind: "mcp",
      description:
        "SonarQube MCP tool token from a profile allowlist or connector.",
    };
  }
  const mcp = key.startsWith("mcp:");
  return {
    key,
    title: mcp ? `MCP · ${key.slice(4)}` : key,
    kind: mcp ? "mcp" : "core",
    description: mcp
      ? "Workspace MCP tool token from a profile allowlist."
      : "Tool token granted on one or more agent profiles.",
  };
}
