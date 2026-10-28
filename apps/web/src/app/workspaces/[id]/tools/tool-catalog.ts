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
    key: "mcp:sonarqube",
    title: "MCP · SonarQube",
    kind: "mcp",
    description:
      "Optional MCP connector for Sonar / SAST findings. Used by fixer and security profiles when connected.",
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
