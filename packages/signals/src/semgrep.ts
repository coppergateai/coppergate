import { envelopeFromSarif } from "./sarif.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/** Semgrep Cloud / CI SARIF ingest (TASK071). */
export class SemgrepSignalAdapter implements SignalAdapter {
  readonly provider = "semgrep";

  verify(input: {
    rawBody: string;
    headers: Headers | Record<string, string | null | undefined>;
    secret?: string | null;
  }) {
    return verifySharedSecret(input);
  }

  normalize(input: { rawBody: string }): SignalEnvelope | null {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }

    if (typeof parsed.externalId === "string" && typeof parsed.title === "string") {
      return {
        provider: "semgrep",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `semgrep:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: ["semgrep"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    if (parsed.runs) {
      return envelopeFromSarif({ provider: "semgrep", raw: parsed });
    }

    // Semgrep findings array shape
    const findings = parsed.findings as unknown[] | undefined;
    if (Array.isArray(findings) && findings[0]) {
      const f = findings[0] as Record<string, unknown>;
      const checkId =
        typeof f.check_id === "string"
          ? f.check_id
          : typeof f.rule_id === "string"
            ? f.rule_id
            : "finding";
      const path = typeof f.path === "string" ? f.path : null;
      const line =
        typeof f.line === "number"
          ? f.line
          : typeof (f.start as { line?: number } | undefined)?.line === "number"
            ? (f.start as { line: number }).line
            : 0;
      const msg =
        typeof f.message === "string"
          ? f.message
          : typeof f.extra === "object" &&
              f.extra &&
              typeof (f.extra as { message?: string }).message === "string"
            ? (f.extra as { message: string }).message
            : checkId;
      const sev =
        typeof f.severity === "string"
          ? f.severity
          : typeof (f.extra as { severity?: string } | undefined)?.severity ===
              "string"
            ? (f.extra as { severity: string }).severity
            : "ERROR";
      const externalId = `${checkId}:${path ?? "?"}:${line}`;
      return {
        provider: "semgrep",
        externalId,
        fingerprint: `semgrep:${externalId}`,
        severity: parseSeverity(sev),
        title: `${checkId}: ${msg}`.slice(0, 500),
        body: [msg, path ? `${path}:${line}` : null].filter(Boolean).join("\n"),
        repoHint: path,
        labels: ["semgrep", checkId],
        rawRef: JSON.stringify({ checkId, path, line }).slice(0, 2000),
      };
    }

    return null;
  }
}
