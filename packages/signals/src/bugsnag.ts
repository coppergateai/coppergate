import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/** Bugsnag / Rollbar thin error adapter (TASK078) — Sentry-shaped fingerprint. */
export class BugsnagSignalAdapter implements SignalAdapter {
  readonly provider = "bugsnag";

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
        provider: "bugsnag",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `bugsnag:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: ["bugsnag"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    // Bugsnag error/event
    const error = parsed.error as Record<string, unknown> | undefined;
    const event = parsed.event as Record<string, unknown> | undefined;
    const id =
      (error?.id != null ? String(error.id) : null) ??
      (typeof parsed.error_id === "string" ? parsed.error_id : null) ??
      (event?.id != null ? String(event.id) : null);
    const title =
      typeof error?.exceptionClass === "string"
        ? `${error.exceptionClass}: ${String(error.message ?? "")}`
        : typeof error?.message === "string"
          ? error.message
          : typeof parsed.title === "string"
            ? parsed.title
            : null;
    if (!id || !title) return null;

    const severity =
      typeof error?.severity === "string"
        ? error.severity
        : typeof parsed.severity === "string"
          ? parsed.severity
          : "error";

    return {
      provider: "bugsnag",
      externalId: id,
      fingerprint: `bugsnag:${typeof error?.context === "string" ? error.context : id}`,
      severity: parseSeverity(severity === "error" ? "high" : severity),
      title: title.slice(0, 500),
      body: title,
      urls:
        typeof error?.url === "string"
          ? [error.url]
          : typeof parsed.url === "string"
            ? [parsed.url]
            : [],
      labels: ["bugsnag", severity],
      rawRef: JSON.stringify({ id, severity }).slice(0, 2000),
    };
  }
}
