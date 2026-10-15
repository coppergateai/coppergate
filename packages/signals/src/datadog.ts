import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Datadog Error Tracking / monitor webhook (TASK077).
 * Shares fingerprint semantics with Sentry-style error groups.
 */
export class DatadogSignalAdapter implements SignalAdapter {
  readonly provider = "datadog";

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
        provider: "datadog",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `datadog:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: ["datadog"],
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    const title =
      typeof parsed.title === "string"
        ? parsed.title
        : typeof parsed.alert_title === "string"
          ? parsed.alert_title
          : typeof parsed.message === "string"
            ? parsed.message.slice(0, 200)
            : null;
    const id =
      typeof parsed.alert_id === "string" || typeof parsed.alert_id === "number"
        ? String(parsed.alert_id)
        : typeof parsed.id === "string"
          ? parsed.id
          : typeof parsed.issue_id === "string"
            ? parsed.issue_id
            : null;
    if (!title || !id) return null;

    const fingerprint =
      typeof parsed.fingerprint === "string"
        ? `datadog:${parsed.fingerprint}`
        : typeof parsed.error_fingerprint === "string"
          ? `datadog:${parsed.error_fingerprint}`
          : `datadog:${id}`;

    const alertType =
      typeof parsed.alert_type === "string" ? parsed.alert_type : "error";
    const severity =
      alertType === "error" || alertType === "critical"
        ? "high"
        : alertType === "warning"
          ? "medium"
          : "low";

    return {
      provider: "datadog",
      externalId: id,
      fingerprint,
      severity: parseSeverity(severity),
      title: title.slice(0, 500),
      body:
        typeof parsed.body === "string"
          ? parsed.body
          : typeof parsed.text_only_message === "string"
            ? parsed.text_only_message
            : title,
      urls:
        typeof parsed.link === "string"
          ? [parsed.link]
          : typeof parsed.url === "string"
            ? [parsed.url]
            : [],
      labels: ["datadog", alertType],
      rawRef: JSON.stringify({ id, alertType, fingerprint }).slice(0, 2000),
    };
  }
}
