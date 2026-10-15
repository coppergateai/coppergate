import { envelopeFromSarif } from "./sarif.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * GitHub CodeQL / Advanced Security alert webhook (TASK070).
 */
export class CodeqlSignalAdapter implements SignalAdapter {
  readonly provider = "codeql";

  verify(input: {
    rawBody: string;
    headers: Headers | Record<string, string | null | undefined>;
    secret?: string | null;
  }) {
    if (!input.secret) return { ok: true as const };
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
        provider: "codeql",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `codeql:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: ["codeql"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    if (parsed.runs) {
      return envelopeFromSarif({ provider: "codeql", raw: parsed });
    }

    const alert = parsed.alert as Record<string, unknown> | undefined;
    if (!alert) return null;
    const number =
      alert.number != null
        ? String(alert.number)
        : typeof alert.html_url === "string"
          ? alert.html_url
          : null;
    const rule = alert.rule as { id?: string; description?: string; severity?: string } | undefined;
    const title =
      rule?.description ??
      (typeof alert.dismissed_reason === "string" ? alert.dismissed_reason : null) ??
      rule?.id ??
      "CodeQL alert";
    if (!number) return null;

    const state = typeof alert.state === "string" ? alert.state : "open";
    if (state === "fixed" || state === "dismissed") {
      return {
        provider: "codeql",
        externalId: number,
        fingerprint: `codeql:${number}`,
        severity: "info",
        title: `CodeQL ${state}: ${title}`.slice(0, 500),
        body: title,
        urls: typeof alert.html_url === "string" ? [alert.html_url] : [],
        labels: ["codeql", state],
        rawRef: JSON.stringify({ number, state, rule: rule?.id }).slice(0, 2000),
      };
    }

    return {
      provider: "codeql",
      externalId: number,
      fingerprint: `codeql:${rule?.id ?? number}`,
      severity: parseSeverity(rule?.severity ?? "high"),
      title: `CodeQL: ${title}`.slice(0, 500),
      body: title,
      urls: typeof alert.html_url === "string" ? [alert.html_url] : [],
      labels: ["codeql", "security", state],
      rawRef: JSON.stringify({ number, rule: rule?.id, state }).slice(0, 2000),
    };
  }
}
