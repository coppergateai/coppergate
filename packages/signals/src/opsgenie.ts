import {
  PAGERDUTY_DEFAULT_TTL_MS,
  PAGERDUTY_HARD_SPEND_MICROS,
} from "./pagerduty.js";
import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/** Opsgenie / Incident.io thin adapter — shared incident envelope (TASK080). */
export class OpsgenieSignalAdapter implements SignalAdapter {
  readonly provider = "opsgenie";

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
        provider: "opsgenie",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `opsgenie:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "critical"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: [
          "opsgenie",
          "incident",
          `ttl_ms:${PAGERDUTY_DEFAULT_TTL_MS}`,
          `spend_cap:${PAGERDUTY_HARD_SPEND_MICROS}`,
        ],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    const alert =
      (parsed.alert as Record<string, unknown> | undefined) ??
      (parsed.data as Record<string, unknown> | undefined) ??
      parsed;
    const id =
      typeof alert.alertId === "string"
        ? alert.alertId
        : typeof alert.id === "string"
          ? alert.id
          : typeof alert.tinyId === "string"
            ? alert.tinyId
            : null;
    const title =
      typeof alert.message === "string"
        ? alert.message
        : typeof alert.alias === "string"
          ? alert.alias
          : typeof alert.title === "string"
            ? alert.title
            : null;
    if (!id || !title) return null;

    const status =
      typeof alert.status === "string"
        ? alert.status
        : typeof parsed.action === "string"
          ? parsed.action
          : "Create";
    const priority =
      typeof alert.priority === "string" ? alert.priority : "P2";

    return {
      provider: "opsgenie",
      externalId: id,
      fingerprint: `opsgenie:${id}`,
      severity:
        priority === "P1"
          ? "critical"
          : priority === "P2"
            ? "high"
            : priority === "P3"
              ? "medium"
              : "low",
      title: `Opsgenie: ${title}`.slice(0, 500),
      body: [title, `status: ${status}`, `priority: ${priority}`].join("\n"),
      labels: [
        "opsgenie",
        "incident",
        status.toLowerCase(),
        `ttl_ms:${PAGERDUTY_DEFAULT_TTL_MS}`,
        `spend_cap:${PAGERDUTY_HARD_SPEND_MICROS}`,
      ],
      rawRef: JSON.stringify({ id, status, priority }).slice(0, 2000),
    };
  }
}
