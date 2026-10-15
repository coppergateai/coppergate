import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Linear webhook normalizer (TASK084).
 * Handles Linear `Issue` create/update and Coppergate-simple envelopes.
 */
export class LinearSignalAdapter implements SignalAdapter {
  readonly provider = "linear";

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
        provider: "linear",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `linear:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        repoHint:
          typeof parsed.repoHint === "string" ? parsed.repoHint : null,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: ["linear"],
        rawRef: JSON.stringify({ kind: "simple", id: parsed.externalId }).slice(
          0,
          2000,
        ),
      };
    }

    const data = parsed.data as Record<string, unknown> | undefined;
    const type = typeof parsed.type === "string" ? parsed.type : null;
    if (!data || (type && type !== "Issue")) {
      // Some Linear payloads omit type or nest differently
      if (!data?.id && !data?.identifier) return null;
    }

    const identifier =
      typeof data.identifier === "string"
        ? data.identifier
        : typeof data.id === "string"
          ? data.id
          : null;
    const title =
      typeof data.title === "string" ? data.title : null;
    if (!identifier || !title) return null;

    const priority =
      typeof data.priority === "number"
        ? data.priority
        : typeof data.priority === "string"
          ? data.priority
          : null;
    const severity =
      priority === 1 || priority === "1"
        ? "critical"
        : priority === 2 || priority === "2"
          ? "high"
          : priority === 3 || priority === "3"
            ? "medium"
            : priority === 4 || priority === "4"
              ? "low"
              : "medium";

    const url =
      typeof data.url === "string"
        ? data.url
        : typeof parsed.url === "string"
          ? parsed.url
          : null;
    const description =
      typeof data.description === "string" ? data.description : title;

    return {
      provider: "linear",
      externalId: identifier,
      fingerprint: `linear:${identifier}`,
      severity: parseSeverity(severity),
      title: `[${identifier}] ${title}`.slice(0, 500),
      body: description,
      urls: url ? [url] : [],
      labels: ["linear"],
      rawRef: JSON.stringify({
        id: data.id ?? null,
        identifier,
        action: parsed.action ?? null,
      }).slice(0, 2000),
    };
  }
}
