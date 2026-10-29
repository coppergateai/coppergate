/**
 * Canonical system tool catalog — single source of truth for UI + seeds.
 * Workspace custom defs are layered on top at read time.
 *
 * Descriptions are short markdown playbooks (When / Focus / Hard rules) for
 * the Tools UI; they are not injected into agent prompts (unlike skills).
 */

export type SystemToolCatalogEntry = {
  key: string;
  title: string;
  kind: "core" | "mcp" | "alias";
  description: string;
  /** When true, ToolRuntime can invoke (requires connection + grant). */
  invokable: boolean;
};

function md(lines: string[]): string {
  return lines.join("\n");
}

export const SYSTEM_TOOL_CATALOG: SystemToolCatalogEntry[] = [
  {
    key: "read",
    title: "Read",
    kind: "core",
    description: md([
      "# Read",
      "",
      "When to use: inspecting sandbox / worktree files without mutation.",
      "",
      "## Focus",
      "- Read files and list paths the agent needs for diagnosis or review.",
      "- Prefer targeted reads over dumping entire trees.",
      "",
      "## Hard rules",
      "- Always safe — no writes, no SCM mutation, no network side effects.",
      "- Still respect path policy / sandbox boundaries.",
    ]),
    invokable: false,
  },
  {
    key: "edit",
    title: "Edit",
    kind: "core",
    description: md([
      "# Edit",
      "",
      "When to use: any delivery that changes code or config in the sandbox.",
      "",
      "## Focus",
      "- Write or patch files required for the task outcome.",
      "- Keep blast radius small; pair with `test` when behavior changes.",
      "",
      "## Hard rules",
      "- Required for FILE write gates — without `edit` (or a write alias), delivery cannot mutate.",
      "- Does not bypass path policy, secret refusals, or approval gates.",
      "- Prefer minimal diffs; no speculative rewrites.",
    ]),
    invokable: false,
  },
  {
    key: "test",
    title: "Test",
    kind: "core",
    description: md([
      "# Test",
      "",
      "When to use: before claiming a fix or opening review — validate in sandbox.",
      "",
      "## Focus",
      "- Run project tests / focused validation commands for the touched surface.",
      "- Prefer regression coverage with the change when fixing bugs.",
      "",
      "## Hard rules",
      "- Do not skip failing tests to greenwash a delivery.",
      "- Evidence before claiming verified — test output beats assertion-only claims.",
    ]),
    invokable: false,
  },
  {
    key: "git",
    title: "Git",
    kind: "core",
    description: md([
      "# Git",
      "",
      "When to use: branching, committing, and preparing SCM diffs for delivery.",
      "",
      "## Focus",
      "- Create focused commits; keep PR titles user-visible and scoped.",
      "- Include lockfile updates when dependencies change.",
      "",
      "## Hard rules",
      "- Does not bypass path policy or secret write refusals.",
      "- Prefer a PR; wait for required `check` green before merge.",
      "- Never force-push `main`/`master` or land while tip CI is red.",
    ]),
    invokable: false,
  },
  {
    key: "mcp:*",
    title: "MCP · all",
    kind: "mcp",
    description: md([
      "# MCP · all",
      "",
      "When to use: rare — only when every connected MCP provider must be available.",
      "",
      "## Focus",
      "- Grants all tools from every enabled workspace MCP connection.",
      "",
      "## Hard rules",
      "- Prefer narrower `mcp:…` or invokable tool grants when possible (least privilege).",
      "- Still requires enabled connections; grant alone does not invent endpoints.",
    ]),
    invokable: false,
  },
  {
    key: "mcp:sonarqube",
    title: "MCP · SonarQube",
    kind: "mcp",
    description: md([
      "# MCP · SonarQube",
      "",
      "When to use: fixer / security work that needs the full Sonar connector surface.",
      "",
      "## Focus",
      "- Allows all tools from a connected SonarQube connector (issues, gate, hotspots).",
      "",
      "## Hard rules",
      "- Requires an enabled SonarQube MCP connection on the workspace.",
      "- Prefer specific `sonar_*` tokens when only one capability is needed.",
      "- Do not weaken auth or expand attack surface to silence findings.",
    ]),
    invokable: false,
  },
  {
    key: "mcp:mcp",
    title: "MCP · generic",
    kind: "mcp",
    description: md([
      "# MCP · generic",
      "",
      "When to use: profiles that need every tool on a generic HTTPS MCP server.",
      "",
      "## Focus",
      "- Allows all tools from a connected generic MCP JSON-RPC endpoint.",
      "",
      "## Hard rules",
      "- Requires an enabled generic MCP connection + optional tool allowlist on the connection.",
      "- Custom catalog tokens do not invent new harness capabilities.",
    ]),
    invokable: false,
  },
  {
    key: "sonar_list_issues",
    title: "Sonar · list issues",
    kind: "mcp",
    description: md([
      "# Sonar · list issues",
      "",
      "When to use: triage open SonarQube issues for the bound project.",
      "",
      "## Focus",
      "- List open issues via ToolRuntime (invokable).",
      "- Use results as evidence for fixer / security remediation.",
      "",
      "## Hard rules",
      "- Requires enabled SonarQube connection + allowlist grant (`sonar_list_issues` or `mcp:sonarqube` / `mcp:*`).",
      "- Invokes consume the per-run tool budget (default max 4).",
    ]),
    invokable: true,
  },
  {
    key: "sonar_quality_gate",
    title: "Sonar · quality gate",
    kind: "mcp",
    description: md([
      "# Sonar · quality gate",
      "",
      "When to use: reading quality-gate status for fitness / ship evidence.",
      "",
      "## Focus",
      "- Fetch gate status used alongside CI / fitness signals.",
      "",
      "## Hard rules",
      "- Requires enabled SonarQube connection + grant.",
      "- Do not claim ship-ready from gate alone — combine with CI and Accept path when architecture-bound.",
    ]),
    invokable: true,
  },
  {
    key: "sonar_hotspots",
    title: "Sonar · hotspots",
    kind: "mcp",
    description: md([
      "# Sonar · hotspots",
      "",
      "When to use: security review of SonarQube hotspots (fixer / security profiles).",
      "",
      "## Focus",
      "- Fetch security hotspots for prioritized remediation.",
      "",
      "## Hard rules",
      "- Requires enabled SonarQube connection + grant.",
      "- Fix root cause with minimal blast radius; do not security-through-obscurity.",
    ]),
    invokable: true,
  },
  {
    key: "write",
    title: "Write (alias)",
    kind: "alias",
    description: md([
      "# Write (alias)",
      "",
      "When to use: legacy allowlists that still list `write` instead of `edit`.",
      "",
      "## Focus",
      "- Treated like `edit` for FILE write gates.",
      "",
      "## Hard rules",
      "- Prefer granting `edit` on new profiles; keep alias only for compatibility.",
    ]),
    invokable: false,
  },
  {
    key: "write_file",
    title: "Write file (alias)",
    kind: "alias",
    description: md([
      "# Write file (alias)",
      "",
      "When to use: legacy allowlists that still list `write_file`.",
      "",
      "## Focus",
      "- Treated like `edit` for FILE write gates.",
      "",
      "## Hard rules",
      "- Prefer granting `edit` on new profiles.",
    ]),
    invokable: false,
  },
  {
    key: "put_file",
    title: "Put file (alias)",
    kind: "alias",
    description: md([
      "# Put file (alias)",
      "",
      "When to use: legacy allowlists that still list `put_file`.",
      "",
      "## Focus",
      "- Treated like `edit` for FILE write gates.",
      "",
      "## Hard rules",
      "- Prefer granting `edit` on new profiles.",
    ]),
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
      description: md([
        `# Sonar · ${label}`,
        "",
        "When to use: SonarQube tool token from a profile allowlist or connector.",
        "",
        "## Focus",
        "- Invokable when ToolRuntime knows the token and a connection is enabled.",
        "",
        "## Hard rules",
        "- Requires grant + enabled SonarQube connection.",
      ]),
      invokable: true,
    };
  }
  const mcp = key.startsWith("mcp:");
  return {
    key,
    title: mcp ? `MCP · ${key.slice(4)}` : key,
    kind: mcp ? "mcp" : "core",
    description: mcp
      ? md([
          `# MCP · ${key.slice(4)}`,
          "",
          "When to use: workspace MCP tool token from a profile allowlist.",
          "",
          "## Focus",
          "- Provider-scoped grant for a connected MCP server.",
          "",
          "## Hard rules",
          "- Connection must be enabled; grant does not invent endpoints.",
        ])
      : md([
          `# ${key}`,
          "",
          "When to use: tool token granted on one or more agent profiles.",
          "",
          "## Focus",
          "- Catalog / allowlist token for runtime policy.",
          "",
          "## Hard rules",
          "- Custom tokens are policy-only unless ToolRuntime implements them.",
        ]),
    invokable: false,
  };
}
