/**
 * Canonical system tool catalog — single source of truth for UI + seeds.
 * Workspace custom defs are layered on top at read time.
 */

export type SystemToolCatalogEntry = {
  key: string;
  title: string;
  kind: "core" | "mcp" | "alias";
  description: string;
  /** When true, ToolRuntime can invoke (requires connection + grant). */
  invokable: boolean;
};

export const SYSTEM_TOOL_CATALOG: SystemToolCatalogEntry[] = [
  {
    key: "read",
    title: "Read",
    kind: "core",
    description:
      "Read files and inspect the sandbox worktree. Always safe; no mutation.",
    invokable: false,
  },
  {
    key: "edit",
    title: "Edit",
    kind: "core",
    description:
      "Write or patch files in the sandbox. Required for delivery that changes code.",
    invokable: false,
  },
  {
    key: "test",
    title: "Test",
    kind: "core",
    description:
      "Run project tests / validation commands inside the sandbox before review.",
    invokable: false,
  },
  {
    key: "git",
    title: "Git",
    kind: "core",
    description:
      "Branch, commit, and prepare SCM diffs for delivery. Does not bypass path policy.",
    invokable: false,
  },
  {
    key: "mcp:*",
    title: "MCP · all",
    kind: "mcp",
    description:
      "Allow every connected MCP provider’s tools for this profile. Prefer narrower mcp:… grants when possible.",
    invokable: false,
  },
  {
    key: "mcp:sonarqube",
    title: "MCP · SonarQube",
    kind: "mcp",
    description:
      "All tools from a connected SonarQube connector (issues, quality gate, hotspots).",
    invokable: false,
  },
  {
    key: "mcp:mcp",
    title: "MCP · generic",
    kind: "mcp",
    description:
      "All tools from a connected generic HTTPS MCP server (JSON-RPC tools/call).",
    invokable: false,
  },
  {
    key: "sonar_list_issues",
    title: "Sonar · list issues",
    kind: "mcp",
    description:
      "List open SonarQube issues for the bound project. Requires an enabled SonarQube connection.",
    invokable: true,
  },
  {
    key: "sonar_quality_gate",
    title: "Sonar · quality gate",
    kind: "mcp",
    description:
      "Read the SonarQube quality-gate status used for fitness / ship evidence.",
    invokable: true,
  },
  {
    key: "sonar_hotspots",
    title: "Sonar · hotspots",
    kind: "mcp",
    description:
      "Fetch SonarQube security hotspots for review by fixer / security profiles.",
    invokable: true,
  },
  {
    key: "write",
    title: "Write (alias)",
    kind: "alias",
    description: "Legacy write token treated like edit for FILE write gates.",
    invokable: false,
  },
  {
    key: "write_file",
    title: "Write file (alias)",
    kind: "alias",
    description:
      "Legacy write_file token treated like edit for FILE write gates.",
    invokable: false,
  },
  {
    key: "put_file",
    title: "Put file (alias)",
    kind: "alias",
    description:
      "Legacy put_file token treated like edit for FILE write gates.",
    invokable: false,
  },
];

export function systemToolMeta(key: string): SystemToolCatalogEntry {
  const known = SYSTEM_TOOL_CATALOG.find((t) => t.key === key);
  if (known) return known;
  if (key.startsWith("sonar_")) {
    const label = key.slice("sonar_".length).replaceAll("_", " ");
    return {
      key,
      title: `Sonar · ${label}`,
      kind: "mcp",
      description:
        "SonarQube tool token from a profile allowlist or connector.",
      invokable: true,
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
    invokable: mcp && key !== "mcp:*" && !key.startsWith("mcp:"),
  };
}
