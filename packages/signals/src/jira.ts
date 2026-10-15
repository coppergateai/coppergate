import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Jira Cloud webhook / simplified envelope normalizer (TASK082).
 * Supports Atlassian issue_created / issue_updated and Coppergate-simple JSON.
 */
export class JiraSignalAdapter implements SignalAdapter {
  readonly provider = "jira";

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
        provider: "jira",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `jira:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        repoHint:
          typeof parsed.repoHint === "string" ? parsed.repoHint : null,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: [
          "jira",
          ...(Array.isArray(parsed.labels)
            ? parsed.labels.filter((l): l is string => typeof l === "string")
            : []),
        ],
        rawRef: JSON.stringify({ kind: "simple", id: parsed.externalId }).slice(
          0,
          2000,
        ),
      };
    }

    const issue = parsed.issue as Record<string, unknown> | undefined;
    const fields = issue?.fields as Record<string, unknown> | undefined;
    if (!issue || typeof issue.key !== "string") return null;

    const summary =
      typeof fields?.summary === "string" ? fields.summary : issue.key;
    const description =
      typeof fields?.description === "string"
        ? fields.description
        : typeof fields?.description === "object" && fields.description
          ? JSON.stringify(fields.description).slice(0, 4000)
          : summary;
    const priority = fields?.priority as { name?: string } | undefined;
    const labels = Array.isArray(fields?.labels)
      ? fields.labels.filter((l): l is string => typeof l === "string")
      : [];
    const self =
      typeof issue.self === "string"
        ? issue.self
        : typeof parsed.issueUrl === "string"
          ? parsed.issueUrl
          : null;

    return {
      provider: "jira",
      externalId: issue.key,
      fingerprint: `jira:${issue.key}`,
      severity: parseSeverity(priority?.name ?? "medium"),
      title: `[${issue.key}] ${summary}`.slice(0, 500),
      body: description,
      urls: self ? [self] : [],
      labels: ["jira", ...labels],
      rawRef: JSON.stringify({
        key: issue.key,
        event: parsed.webhookEvent ?? null,
      }).slice(0, 2000),
    };
  }
}
