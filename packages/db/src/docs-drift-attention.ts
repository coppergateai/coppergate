/**
 * AG-022 — wire detectDocsDrift → optional Arena attention (advisory, not Spend License bypass).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { detectDocsDrift } from "@coppergate/signals";
import type { Database } from "./client.js";
import { artifacts } from "./schema.js";

export type DocsDriftOptionalAttention = {
  kind: "docs_drift";
  message: string;
  apiPaths: string[];
};

export function filesChangedFromDeliveryBody(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.filesChanged)) {
    return o.filesChanged.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0,
    );
  }
  if (Array.isArray(o.files)) {
    return o.files
      .map((f: { path?: string } | string) =>
        typeof f === "string" ? f : f.path,
      )
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  }
  return [];
}

/** Pure: evaluate delivery paths with the shared signals heuristic. */
export function evaluateDocsDriftAttention(
  filesChanged: string[],
): DocsDriftOptionalAttention | null {
  const result = detectDocsDrift(filesChanged.map((path) => ({ path })));
  if (!result.drifted) return null;
  const sample = result.apiPaths.slice(0, 3).join(", ");
  const more =
    result.apiPaths.length > 3
      ? ` (+${result.apiPaths.length - 3} more)`
      : "";
  return {
    kind: "docs_drift",
    message: `Docs drift · API paths changed without docs (${sample}${more})`,
    apiPaths: result.apiPaths,
  };
}

export function docsDriftProgressPayload(
  attention: DocsDriftOptionalAttention,
): Record<string, unknown> {
  return {
    code: "docs_drift",
    message: attention.message,
    apiPaths: attention.apiPaths,
    optional: true,
  };
}

function parseInlineBody(metaRaw: string | null): unknown {
  if (!metaRaw?.trim()) return null;
  try {
    const meta = JSON.parse(metaRaw) as Record<string, unknown>;
    if (typeof meta.inlineBody === "string") {
      try {
        return JSON.parse(meta.inlineBody);
      } catch {
        return null;
      }
    }
    return meta;
  } catch {
    return null;
  }
}

/**
 * Latest delivery_report / diff_summary filesChanged per run (newest artifact wins).
 */
export async function latestDeliveryFilesForRuns(
  db: Database,
  workspaceId: string,
  runIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (runIds.length === 0) return map;

  const rows = await db
    .select({
      runId: artifacts.runId,
      kind: artifacts.kind,
      meta: artifacts.meta,
      createdAt: artifacts.createdAt,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.workspaceId, workspaceId),
        inArray(artifacts.runId, runIds),
        inArray(artifacts.kind, ["delivery_report", "diff_summary"]),
      ),
    )
    .orderBy(desc(artifacts.createdAt));

  for (const row of rows) {
    if (!row.runId || map.has(row.runId)) continue;
    const body = parseInlineBody(row.meta);
    const files = filesChangedFromDeliveryBody(body);
    if (files.length > 0) map.set(row.runId, files);
  }
  return map;
}

export async function docsDriftAttentionForRuns(
  db: Database,
  workspaceId: string,
  runIds: string[],
): Promise<Map<string, DocsDriftOptionalAttention>> {
  const filesByRun = await latestDeliveryFilesForRuns(db, workspaceId, runIds);
  const out = new Map<string, DocsDriftOptionalAttention>();
  for (const [runId, files] of filesByRun) {
    const attention = evaluateDocsDriftAttention(files);
    if (attention) out.set(runId, attention);
  }
  return out;
}
