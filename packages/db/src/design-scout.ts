import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { titlesOverlap, type OpenIssueRef } from "./community-scout.js";
import { maintainerEvents } from "./schema.js";

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
      const labels = (i.labels ?? []).map((l) => l.toLowerCase());
      const isDesignLabeled =
        labels.includes("design") ||
        labels.includes("ux") ||
        t.startsWith("design:");
      if (!isDesignLabeled) return titlesOverlap(i.title, title);
      return (
        t.includes(` ${pathKey}`) ||
        t.endsWith(pathKey) ||
        t.includes(`on ${pathKey}`)
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
