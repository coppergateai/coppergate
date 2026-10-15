import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Azure Boards work item webhook normalizer (TASK085).
 * Supports service-hook payloads and Coppergate-simple JSON.
 */
export class AzureBoardsSignalAdapter implements SignalAdapter {
  readonly provider = "azure_boards";

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
        provider: "azure_boards",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `azure_boards:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "medium"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: [
          "azure_boards",
          ...(Array.isArray(parsed.labels)
            ? parsed.labels.filter((l): l is string => typeof l === "string")
            : []),
        ],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    const resource = parsed.resource as Record<string, unknown> | undefined;
    const fields =
      (resource?.fields as Record<string, unknown> | undefined) ??
      (parsed.fields as Record<string, unknown> | undefined);
    const id =
      resource?.id != null
        ? String(resource.id)
        : parsed.id != null
          ? String(parsed.id)
          : null;
    if (!id || !fields) return null;

    const titleField = fields["System.Title"] as
      | string
      | { newValue?: string; oldValue?: string }
      | undefined;
    const title =
      typeof titleField === "string"
        ? titleField
        : typeof titleField?.newValue === "string"
          ? titleField.newValue
          : typeof resource?.rev === "number"
            ? `Work item ${id}`
            : null;
    if (!title) return null;

    const priorityField = fields["Microsoft.VSTS.Common.Priority"] as
      | number
      | { newValue?: number }
      | undefined;
    const priority =
      typeof priorityField === "number"
        ? priorityField
        : typeof priorityField?.newValue === "number"
          ? priorityField.newValue
          : 2;
    const severity =
      priority <= 1 ? "critical" : priority === 2 ? "high" : "medium";

    const url =
      typeof resource?.url === "string"
        ? resource.url
        : typeof resource?._links === "object" &&
            resource._links &&
            typeof (resource._links as { html?: { href?: string } }).html
              ?.href === "string"
          ? (resource._links as { html: { href: string } }).html.href
          : null;

    const eventType =
      typeof parsed.eventType === "string" ? parsed.eventType : "workitem";

    return {
      provider: "azure_boards",
      externalId: id,
      fingerprint: `azure_boards:${id}`,
      severity: parseSeverity(severity),
      title: `[AB#${id}] ${title}`.slice(0, 500),
      body: title,
      urls: url ? [url] : [],
      labels: ["azure_boards", eventType],
      rawRef: JSON.stringify({ id, eventType }).slice(0, 2000),
    };
  }
}
