import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type HostedCheckReport = {
  checkedAt: string;
  baseUrl: string;
  projectUrl: string;
  workspaceId: string;
  projectId: string;
  authenticated: boolean;
  projectName: string | null;
  repoFullName: string | null;
  budgetStatus: string | null;
  autonomyLevel: string | null;
  lastRunStatus: string | null;
  tabs: {
    overview: string;
    delivery: string;
    arena: string;
    more: string;
  };
  coppergatePulls: Array<{
    number: number;
    title: string;
    htmlUrl: string;
  }>;
  coppergatePullsError: string | null;
  github: {
    repo: string;
    open: Array<{
      number: number;
      title: string;
      draft: boolean;
      html_url: string;
      head?: string;
      updated_at: string;
    }>;
    recentClosedOrMerged: Array<{
      number: number;
      title: string;
      merged: boolean;
      html_url: string;
      updated_at: string;
    }>;
  };
  assertions: Array<{ name: string; ok: boolean; detail?: string }>;
};

export function writeReport(report: HostedCheckReport): string {
  const outDir = resolve(import.meta.dirname, "../.auth");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "last-check.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    `# Coppergate hosted check`,
    ``,
    `- Checked: ${report.checkedAt}`,
    `- Project: ${report.projectUrl}`,
    `- Auth: ${report.authenticated ? "ok" : "FAILED"}`,
    `- Name: ${report.projectName ?? "—"}`,
    `- Repo: ${report.repoFullName ?? "—"}`,
    `- Budget: ${report.budgetStatus ?? "—"}`,
    `- Autonomy: ${report.autonomyLevel ?? "—"}`,
    `- Last run: ${report.lastRunStatus ?? "—"}`,
    ``,
    `## Assertions`,
    ...report.assertions.map(
      (a) => `- ${a.ok ? "PASS" : "FAIL"} ${a.name}${a.detail ? ` — ${a.detail}` : ""}`,
    ),
    ``,
    `## Coppergate open PRs (${report.coppergatePulls.length})`,
    ...(report.coppergatePulls.length
      ? report.coppergatePulls.map(
          (p) => `- [#${p.number}](${p.htmlUrl}) ${p.title}`,
        )
      : [
          `- none${report.coppergatePullsError ? ` (${report.coppergatePullsError})` : ""}`,
        ]),
    ``,
    `## GitHub ${report.github.repo} — open (${report.github.open.length})`,
    ...(report.github.open.length
      ? report.github.open.map(
          (p) =>
            `- [#${p.number}](${p.html_url}) ${p.draft ? "[draft] " : ""}${p.title}${p.head ? ` (${p.head})` : ""}`,
        )
      : [`- none`]),
    ``,
    `## GitHub recent closed/merged (${report.github.recentClosedOrMerged.length})`,
    ...(report.github.recentClosedOrMerged.length
      ? report.github.recentClosedOrMerged.map(
          (p) =>
            `- [#${p.number}](${p.html_url}) ${p.merged ? "merged" : "closed"} ${p.title}`,
        )
      : [`- none`]),
    ``,
  ].join("\n");

  const mdPath = resolve(outDir, "last-check.md");
  writeFileSync(mdPath, md);
  return mdPath;
}
