import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { agentRunEvents } from "./schema.js";

export type RunProgressHint = {
  codingPathLine: string | null;
  failoverLine: string | null;
  /** AG-022 — advisory docs drift (optional Arena attention, not needsAttention). */
  optionalAttentionLine: string | null;
};

function parsePayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/** Pure helper — mirrors @coppergate/agents formatting for DB-layer consumers. */
export function runProgressHintFromPayload(
  payload: Record<string, unknown> | null,
): RunProgressHint {
  if (!payload) {
    return {
      codingPathLine: null,
      failoverLine: null,
      optionalAttentionLine: null,
    };
  }
  if (payload.code === "docs_drift") {
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    return {
      codingPathLine: null,
      failoverLine: null,
      optionalAttentionLine: message || "Docs drift · API changed without docs",
    };
  }
  const code = payload.code;
  if (code === "coding_path_honesty") {
    const demoted = payload.demoted;
    if (
      demoted &&
      typeof demoted === "object" &&
      (demoted as { harness?: string }).harness === "native_openai" &&
      typeof (demoted as { reason?: string }).reason === "string"
    ) {
      return {
        codingPathLine: `Cursor harness · native_openai demoted — ${(demoted as { reason: string }).reason}`,
        failoverLine: null,
        optionalAttentionLine: null,
      };
    }
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    return {
      codingPathLine: message || "Coding path selected",
      failoverLine: null,
      optionalAttentionLine: null,
    };
  }
  if (code === "provider_failover") {
    const reason =
      typeof payload.reason === "string" ? payload.reason.trim() : "";
    const trigger =
      typeof payload.trigger === "string" ? payload.trigger.trim() : "";
    let failoverLine = "Provider failover engaged";
    if (reason && trigger) {
      failoverLine = `Failover (${trigger.replace(/_/g, " ")}): ${reason}`;
    } else if (reason) {
      failoverLine = `Provider failover: ${reason}`;
    }
    return { codingPathLine: null, failoverLine, optionalAttentionLine: null };
  }
  return {
    codingPathLine: null,
    failoverLine: null,
    optionalAttentionLine: null,
  };
}

/**
 * Latest progress hint per run (coding path honesty + provider failover).
 * Used by Arena spectacle activity lines.
 */
export async function latestRunProgressHints(
  db: Database,
  runIds: string[],
): Promise<Map<string, RunProgressHint>> {
  const map = new Map<string, RunProgressHint>();
  if (runIds.length === 0) return map;

  const rows = await db
    .select({
      runId: agentRunEvents.runId,
      payload: agentRunEvents.payload,
      seq: agentRunEvents.seq,
    })
    .from(agentRunEvents)
    .where(
      and(
        inArray(agentRunEvents.runId, runIds),
        eq(agentRunEvents.kind, "progress"),
      ),
    )
    .orderBy(desc(agentRunEvents.seq));

  for (const row of rows) {
    if (map.has(row.runId)) continue;
    const payload = parsePayload(row.payload);
    const hint = runProgressHintFromPayload(payload);
    if (
      hint.codingPathLine ||
      hint.failoverLine ||
      hint.optionalAttentionLine
    ) {
      map.set(row.runId, hint);
    }
  }
  return map;
}

export function mergeRunActivityLine(
  base: string,
  hint: RunProgressHint | null | undefined,
  state: "running" | "idle" | "needsAttention" | "awaitingCi",
): string {
  if (!hint) return base;
  if (state === "running" && hint.failoverLine) return hint.failoverLine;
  if (hint.codingPathLine && state === "running") {
    return hint.codingPathLine.length > 96
      ? `${hint.codingPathLine.slice(0, 93)}…`
      : hint.codingPathLine;
  }
  if (state === "running" && hint.failoverLine) return hint.failoverLine;
  if (
    (state === "awaitingCi" || state === "idle") &&
    hint.optionalAttentionLine
  ) {
    return hint.optionalAttentionLine.length > 120
      ? `${hint.optionalAttentionLine.slice(0, 117)}…`
      : hint.optionalAttentionLine;
  }
  return base;
}
