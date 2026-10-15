import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Deterministic FakeSignalAdapter for CI and owner test ingest (TASK062).
 */
export class FakeSignalAdapter implements SignalAdapter {
  readonly provider = "fake";

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
    const externalId =
      typeof parsed.externalId === "string"
        ? parsed.externalId
        : typeof parsed.id === "string"
          ? parsed.id
          : null;
    const title =
      typeof parsed.title === "string" ? parsed.title : null;
    if (!externalId || !title) return null;

    const fingerprint =
      typeof parsed.fingerprint === "string"
        ? parsed.fingerprint
        : `fake:${externalId}`;

    return {
      provider: "fake",
      externalId,
      fingerprint,
      severity: parseSeverity(parsed.severity),
      title: title.slice(0, 500),
      body: typeof parsed.body === "string" ? parsed.body : title,
      repoHint:
        typeof parsed.repoHint === "string" ? parsed.repoHint : null,
      urls: Array.isArray(parsed.urls)
        ? parsed.urls.filter((u): u is string => typeof u === "string")
        : [],
      labels: Array.isArray(parsed.labels)
        ? parsed.labels.filter((l): l is string => typeof l === "string")
        : [],
      projectHint:
        typeof parsed.projectHint === "string"
          ? parsed.projectHint
          : null,
      rawRef: JSON.stringify({
        externalId,
        title,
        severity: parsed.severity ?? null,
      }).slice(0, 2000),
    };
  }
}
