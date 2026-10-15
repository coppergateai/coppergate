import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

export const PAGERDUTY_DEFAULT_TTL_MS = 30 * 60_000;
export const PAGERDUTY_HARD_SPEND_MICROS = 40_000;

/**
 * PagerDuty incident webhook — tight TTL hotfix arena (TASK079).
 * Labels carry ttl_ms + spend_cap for auto-arm policy.
 */
export class PagerDutySignalAdapter implements SignalAdapter {
  readonly provider = "pagerduty";

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
        provider: "pagerduty",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `pagerduty:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "critical"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: [
          "pagerduty",
          "incident",
          `ttl_ms:${PAGERDUTY_DEFAULT_TTL_MS}`,
          `spend_cap:${PAGERDUTY_HARD_SPEND_MICROS}`,
        ],
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    const messages = parsed.messages as unknown[] | undefined;
    const event =
      (Array.isArray(messages) ? messages[0] : null) as
        | Record<string, unknown>
        | null
        | undefined;
    const incident =
      (event?.incident as Record<string, unknown> | undefined) ??
      (parsed.incident as Record<string, unknown> | undefined) ??
      (parsed.data as Record<string, unknown> | undefined);

    if (!incident) return null;

    const id =
      typeof incident.id === "string"
        ? incident.id
        : typeof incident.incident_number === "number"
          ? String(incident.incident_number)
          : null;
    const title =
      typeof incident.title === "string"
        ? incident.title
        : typeof incident.summary === "string"
          ? incident.summary
          : null;
    if (!id || !title) return null;

    const status =
      typeof incident.status === "string" ? incident.status : "triggered";
    const urgency =
      typeof incident.urgency === "string" ? incident.urgency : "high";
    const htmlUrl =
      typeof incident.html_url === "string"
        ? incident.html_url
        : typeof (incident as { htmlUrl?: string }).htmlUrl === "string"
          ? (incident as { htmlUrl: string }).htmlUrl
          : null;

    if (status === "resolved") {
      return {
        provider: "pagerduty",
        externalId: id,
        fingerprint: `pagerduty:${id}`,
        severity: "info",
        title: `PD resolved: ${title}`.slice(0, 500),
        body: title,
        urls: htmlUrl ? [htmlUrl] : [],
        labels: ["pagerduty", "resolved"],
        rawRef: JSON.stringify({ id, status }).slice(0, 2000),
      };
    }

    return {
      provider: "pagerduty",
      externalId: id,
      fingerprint: `pagerduty:${id}`,
      severity: urgency === "low" ? "medium" : "critical",
      title: `PD incident: ${title}`.slice(0, 500),
      body: [
        title,
        `status: ${status}`,
        `urgency: ${urgency}`,
        `ttl_ms: ${PAGERDUTY_DEFAULT_TTL_MS}`,
        `spend_cap_micros: ${PAGERDUTY_HARD_SPEND_MICROS}`,
      ].join("\n"),
      urls: htmlUrl ? [htmlUrl] : [],
      labels: [
        "pagerduty",
        "incident",
        status,
        `ttl_ms:${PAGERDUTY_DEFAULT_TTL_MS}`,
        `spend_cap:${PAGERDUTY_HARD_SPEND_MICROS}`,
      ],
      rawRef: JSON.stringify({ id, status, urgency }).slice(0, 2000),
    };
  }
}

export function parseIncidentConstraints(labels: string[] | undefined): {
  ttlMs: number | null;
  spendCapMicros: number | null;
} {
  let ttlMs: number | null = null;
  let spendCapMicros: number | null = null;
  for (const l of labels ?? []) {
    if (l.startsWith("ttl_ms:")) {
      const n = Number(l.slice("ttl_ms:".length));
      if (Number.isFinite(n) && n > 0) ttlMs = n;
    }
    if (l.startsWith("spend_cap:")) {
      const n = Number(l.slice("spend_cap:".length));
      if (Number.isFinite(n) && n > 0) spendCapMicros = n;
    }
  }
  return { ttlMs, spendCapMicros };
}
