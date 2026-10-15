import type { SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";

/**
 * Shared SARIF → SignalEnvelope normalizer (TASK071 / TASK073).
 */
export function envelopeFromSarif(input: {
  provider: string;
  raw: Record<string, unknown>;
}): SignalEnvelope | null {
  const runs = input.raw.runs as unknown[] | undefined;
  if (!Array.isArray(runs) || runs.length === 0) return null;

  const run0 = runs[0] as Record<string, unknown>;
  const results = run0.results as unknown[] | undefined;
  if (!Array.isArray(results) || results.length === 0) {
    // Still emit a scan-completed signal with low severity
    const tool = run0.tool as { driver?: { name?: string } } | undefined;
    const name = tool?.driver?.name ?? input.provider;
    return {
      provider: input.provider,
      externalId: `${input.provider}:empty:${Date.now()}`,
      fingerprint: `${input.provider}:empty`,
      severity: "info",
      title: `${name} scan: no results`,
      body: `${name} SARIF contained no results`,
      labels: [input.provider, "sarif"],
      rawRef: JSON.stringify({ tool: name, results: 0 }).slice(0, 2000),
    };
  }

  const first = results[0] as Record<string, unknown>;
  const ruleId =
    typeof first.ruleId === "string"
      ? first.ruleId
      : typeof (first.rule as { id?: string } | undefined)?.id === "string"
        ? (first.rule as { id: string }).id
        : "finding";
  const level =
    typeof first.level === "string" ? first.level : "warning";
  const message =
    typeof (first.message as { text?: string } | undefined)?.text === "string"
      ? (first.message as { text: string }).text
      : ruleId;

  const loc = Array.isArray(first.locations)
    ? (first.locations[0] as Record<string, unknown> | undefined)
    : undefined;
  const phys = loc?.physicalLocation as
    | {
        artifactLocation?: { uri?: string };
        region?: { startLine?: number };
      }
    | undefined;
  const uri = phys?.artifactLocation?.uri ?? null;
  const line = phys?.region?.startLine ?? null;

  const severity =
    level === "error"
      ? "high"
      : level === "warning"
        ? "medium"
        : level === "note"
          ? "low"
          : parseSeverity(level);

  const externalId = `${ruleId}:${uri ?? "unknown"}:${line ?? 0}`;
  return {
    provider: input.provider,
    externalId,
    fingerprint: `${input.provider}:${externalId}`,
    severity,
    title: `${ruleId}: ${message}`.slice(0, 500),
    body: [
      message,
      uri ? `file: ${uri}${line != null ? `:${line}` : ""}` : null,
      `results: ${results.length}`,
    ]
      .filter(Boolean)
      .join("\n"),
    repoHint: uri,
    labels: [input.provider, "sarif", ruleId, level],
    rawRef: JSON.stringify({
      ruleId,
      uri,
      line,
      resultCount: results.length,
    }).slice(0, 2000),
  };
}
