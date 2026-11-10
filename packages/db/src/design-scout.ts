import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  appendOpenProgramRows,
  nextArchitectureId,
  parseArchitectureProgramRows,
  type OpenProgramRowAppend,
} from "./architecture-backlog.js";
import { titlesOverlap, type OpenIssueRef } from "./community-scout.js";
import { maintainerEvents } from "./schema.js";

export const DESIGN_SCOUT_SECTION_HEADING = "## Design scout (continuous)";

export type DesignShotMetrics = {
  client: number;
  scrollW: number;
  hScroll: boolean;
  mainW: number;
  overflowRight: Array<{ cls: string; right: number }>;
  title: string;
};

export type DesignShot = {
  name: string;
  url: string;
  path: string;
  metrics: DesignShotMetrics;
  pngPath?: string;
  pngBytes?: Uint8Array;
};

export type DesignIssueCandidate = {
  title: string;
  body: string;
  shotName: string;
  url: string;
  path: string;
};

export type DesignScoutRoute = {
  name: string;
  path: string;
  requiresAuth?: boolean;
  ready?: RegExp;
};

export const DEFAULT_DESIGN_SCOUT_ROUTES: DesignScoutRoute[] = [
  { name: "landing", path: "/", ready: /Coppergate|agent|GitHub/i },
  { name: "pricing", path: "/docs/pricing", ready: /pricing|Community|self-host|Free/i },
  { name: "docs", path: "/docs", ready: /Docs|Documentation|Getting started/i },
  { name: "login", path: "/login", ready: /Sign|Log in|Continue|GitHub/i },
  {
    name: "mission-control",
    path: "/workspaces/{workspaceId}",
    requiresAuth: true,
    ready: /Mission Control/i,
  },
  {
    name: "agents",
    path: "/workspaces/{workspaceId}/agents",
    requiresAuth: true,
    ready: /Agents/i,
  },
  {
    name: "skills",
    path: "/workspaces/{workspaceId}/skills",
    requiresAuth: true,
    ready: /Skills/i,
  },
  {
    name: "tools",
    path: "/workspaces/{workspaceId}/tools",
    requiresAuth: true,
    ready: /Tools/i,
  },
];

export function resolveDesignScoutRoutes(input: {
  workspaceId?: string | null;
  hasAuth: boolean;
  routes?: DesignScoutRoute[];
}): DesignScoutRoute[] {
  const routes = input.routes ?? DEFAULT_DESIGN_SCOUT_ROUTES;
  const ws = input.workspaceId?.trim() || null;
  return routes
    .filter((r) => !r.requiresAuth || (input.hasAuth && ws))
    .map((r) => ({
      ...r,
      path: ws ? r.path.replaceAll("{workspaceId}", ws) : r.path,
    }))
    .filter((r) => !r.path.includes("{workspaceId}"));
}

export function shotHasDesignFinding(metrics: DesignShotMetrics): boolean {
  if (metrics.hScroll) return true;
  if (metrics.overflowRight.length > 0) return true;
  if (metrics.scrollW > metrics.client + 1) return true;
  return false;
}

export function formatDesignIssueBody(input: {
  shot: DesignShot;
  imageMarkdown?: string | null;
  runId: string;
}): string {
  const m = input.shot.metrics;
  const findings: string[] = [];
  if (m.hScroll || m.scrollW > m.client + 1) {
    findings.push(
      `- Horizontal overflow: scrollWidth ${m.scrollW} > clientWidth ${m.client}`,
    );
  }
  for (const o of m.overflowRight.slice(0, 5)) {
    findings.push(
      `- Element overflows right edge (cls=\`${o.cls || "(none)"}\`, right=${o.right})`,
    );
  }
  if (findings.length === 0) {
    findings.push("- Visual / layout anomaly flagged by design scout");
  }

  return [
    `## Design finding`,
    ``,
    `- **URL:** ${input.shot.url}`,
    `- **Route:** \`${input.shot.path}\``,
    `- **Viewport:** 1440×900 (light)`,
    `- **Document title:** ${m.title || "(none)"}`,
    ``,
    `## Evidence`,
    findings.join("\n"),
    ``,
    input.imageMarkdown?.trim()
      ? `### Screenshot\n\n${input.imageMarkdown.trim()}`
      : `### Screenshot\n\n_(upload pending or unavailable)_`,
    ``,
    `## Acceptance`,
    `- [ ] No horizontal page scroll at 1440px width`,
    `- [ ] Main content fits within the viewport without clipping`,
    `- [ ] Re-capture the route after the fix and confirm metrics are clean`,
    ``,
    `## Notes`,
    `Opened by **design scout** (metric-driven). Prefer a focused CSS/layout fix; keep blast radius small.`,
    ``,
    `---`,
    `<!-- coppergate-design-scout runId=${input.runId} shot=${input.shot.name} path=${input.shot.path} -->`,
  ].join("\n");
}

/** Stable fingerprint per route path for Open Program dedup. */
export function designScoutFingerprint(path: string): string {
  const p =
    path
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "root";
  return `path_${p}`;
}

export function extractDesignScoutFingerprints(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const m of markdown.matchAll(
    /<!--\s*design-scout:fp=([a-zA-Z0-9_-]+)\s*-->/g,
  )) {
    out.add(m[1]!);
  }
  return out;
}

export type DesignOpenCandidate = OpenProgramRowAppend & {
  fingerprint: string;
  path: string;
};

/**
 * Propose Open Program rows (P-N) from layout overflow shots; dedup fp + title.
 */
export function proposeDesignOpenRows(input: {
  markdown: string;
  shots: DesignShot[];
  max: number;
  excludeFingerprints?: string[];
}): DesignOpenCandidate[] {
  const max = Math.max(0, Math.min(5, Math.floor(input.max)));
  if (max === 0) return [];

  const existingFp = extractDesignScoutFingerprints(input.markdown);
  for (const fp of input.excludeFingerprints ?? []) {
    if (fp) existingFp.add(fp);
  }
  const programRows = parseArchitectureProgramRows(input.markdown);
  const existingTitles = programRows.map((r) => r.title);

  const out: DesignOpenCandidate[] = [];
  let mdForIds = input.markdown;

  for (const shot of input.shots) {
    if (out.length >= max) break;
    if (!shotHasDesignFinding(shot.metrics)) continue;

    const fp = designScoutFingerprint(shot.path);
    if (existingFp.has(fp)) continue;

    const m = shot.metrics;
    const findings: string[] = [];
    if (m.hScroll || m.scrollW > m.client + 1) {
      findings.push(`hScroll ${m.scrollW}>${m.client}`);
    }
    if (m.overflowRight.length > 0) {
      findings.push(`overflowRight×${m.overflowRight.length}`);
    }
    const title = `Fix layout overflow on ${shot.path}`.slice(0, 120);
    if (existingTitles.some((t) => titlesOverlap(t, title))) continue;
    if (out.some((c) => titlesOverlap(c.title, title) || c.path === shot.path)) {
      continue;
    }

    const id = nextArchitectureId(mdForIds, "P");
    const notes = [
      `route=${shot.path}`,
      findings.join("; ") || "layout anomaly",
      `url=${shot.url}`.slice(0, 80),
      `<!-- design-scout:fp=${fp} -->`,
    ].join(" — ").slice(0, 400);

    const row: DesignOpenCandidate = {
      id,
      title,
      notes,
      fingerprint: fp,
      path: shot.path,
    };
    out.push(row);
    existingFp.add(fp);
    mdForIds = `${mdForIds}\n| Open | ${id} | ${row.title} | ${notes} |\n`;
  }

  return out;
}

export function appendDesignScoutOpenRowsToMarkdown(
  markdown: string,
  rows: OpenProgramRowAppend[],
): { content: string; changed: boolean } {
  return appendOpenProgramRows(markdown, rows, {
    sectionHeading: DESIGN_SCOUT_SECTION_HEADING,
  });
}

export function proposeDesignIssues(input: {
  shots: DesignShot[];
  openIssues: OpenIssueRef[];
  max: number;
  runId: string;
  imageMarkdownByShot?: Record<string, string>;
}): DesignIssueCandidate[] {
  const max = Math.max(0, Math.min(10, Math.floor(input.max)));
  if (max === 0) return [];

  const out: DesignIssueCandidate[] = [];
  for (const shot of input.shots) {
    if (!shotHasDesignFinding(shot.metrics)) continue;

    const pathKey = shot.path.toLowerCase();
    const title = `design: fix layout overflow on ${shot.path}`.slice(0, 200);
    const dup = input.openIssues.some((i) => {
      const t = i.title.toLowerCase();
      const body = (i.body ?? "").toLowerCase();
      const labels = (i.labels ?? []).map((l) => l.toLowerCase());
      const isDesignLabeled =
        labels.includes("design") ||
        labels.includes("ux") ||
        t.startsWith("design:") ||
        body.includes("coppergate-design-scout");
      if (!isDesignLabeled) return titlesOverlap(i.title, title);
      // Prefer scout HTML comment path=… (exact; "/" must not match "/docs").
      const pathMarker = `path=${pathKey}`;
      const pathIdx = body.indexOf(pathMarker);
      if (pathIdx >= 0) {
        const after = body.slice(pathIdx + pathMarker.length, pathIdx + pathMarker.length + 1);
        if (after === "" || after === " " || after === "-" || after === "\n") {
          return true;
        }
      }
      if (pathKey === "/") {
        return (
          /(?:^|[\s:])design:.*overflow on \/$/i.test(t.trim()) ||
          /\*\*route:\*\* `\/`/i.test(body)
        );
      }
      return (
        t.includes(`on ${pathKey}`) ||
        t.endsWith(` ${pathKey}`) ||
        t.endsWith(pathKey) ||
        body.includes(`**route:** \`${pathKey}\``)
      );
    });
    if (dup) continue;
    if (out.some((c) => c.path === shot.path)) continue;

    out.push({
      title,
      body: formatDesignIssueBody({
        shot,
        runId: input.runId,
        imageMarkdown: input.imageMarkdownByShot?.[shot.name] ?? null,
      }),
      shotName: shot.name,
      url: shot.url,
      path: shot.path,
    });
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

export async function isDesignScoutDue(
  db: Database,
  projectId: string,
  intervalHours: number,
  now = new Date(),
): Promise<boolean> {
  const hours = Math.max(1, Math.floor(intervalHours));
  const [last] = await db
    .select()
    .from(maintainerEvents)
    .where(
      and(
        eq(maintainerEvents.projectId, projectId),
        eq(maintainerEvents.kind, "design_scout"),
      ),
    )
    .orderBy(desc(maintainerEvents.createdAt))
    .limit(1);
  if (!last) return true;
  const elapsed = now.getTime() - last.createdAt.getTime();
  return elapsed >= hours * 60 * 60 * 1000;
}

export async function recordDesignScoutEvent(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(maintainerEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: "design_scout",
    payload: JSON.stringify({ action: "scout", ...input.payload }),
    createdAt: new Date(),
  });
}
