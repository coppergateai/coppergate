import { envelopeFromSarif } from "./sarif.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/** Trivy / Grype SARIF ingest (TASK073) — shared SARIF normalizer. */
export class TrivySignalAdapter implements SignalAdapter {
  readonly provider = "trivy";

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
        provider: "trivy",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `trivy:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: ["trivy", "sca"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }
    if (parsed.runs) {
      return envelopeFromSarif({ provider: "trivy", raw: parsed });
    }
    return null;
  }
}
