import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Sentry issue / event webhook normalizer (TASK076).
 * Fingerprint-stable so alert storms dedupe.
 */
export class SentrySignalAdapter implements SignalAdapter {
  readonly provider = "sentry";

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
      const fingerprint =
        typeof parsed.fingerprint === "string"
          ? parsed.fingerprint
          : `sentry:${parsed.externalId}`;
      return {
        provider: "sentry",
        externalId: parsed.externalId,
        fingerprint,
        severity: parseSeverity(parsed.severity ?? "high"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        repoHint:
          typeof parsed.repoHint === "string" ? parsed.repoHint : null,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: ["sentry"],
        rawRef: JSON.stringify({ kind: "simple", id: parsed.externalId }).slice(
          0,
          2000,
        ),
      };
    }

    const data = (parsed.data as Record<string, unknown> | undefined) ?? parsed;
    const issue =
      (data.issue as Record<string, unknown> | undefined) ??
      (parsed.issue as Record<string, unknown> | undefined) ??
      data;

    const id =
      issue.id != null
        ? String(issue.id)
        : typeof parsed.id === "string"
          ? parsed.id
          : null;
    const title =
      typeof issue.title === "string"
        ? issue.title
        : typeof issue.culprit === "string"
          ? issue.culprit
          : null;
    if (!id || !title) return null;

    const level =
      typeof issue.level === "string"
        ? issue.level
        : typeof data.level === "string"
          ? data.level
          : "error";
    const severity =
      level === "fatal"
        ? "critical"
        : level === "error"
          ? "high"
          : level === "warning"
            ? "medium"
            : "low";

    const fpArr = Array.isArray(issue.fingerprint)
      ? issue.fingerprint.filter((x): x is string => typeof x === "string")
      : [];
    const fingerprint =
      fpArr.length > 0
        ? `sentry:${fpArr.join("|")}`
        : typeof issue.metadata === "object" &&
            issue.metadata &&
            typeof (issue.metadata as { type?: string }).type === "string"
          ? `sentry:${(issue.metadata as { type: string }).type}:${title}`
          : `sentry:${id}`;

    const url =
      typeof issue.web_url === "string"
        ? issue.web_url
        : typeof issue.url === "string"
          ? issue.url
          : typeof issue.permalink === "string"
            ? issue.permalink
            : null;
    const project =
      typeof issue.project === "string"
        ? issue.project
        : typeof (issue.project as { slug?: string } | undefined)?.slug ===
            "string"
          ? (issue.project as { slug: string }).slug
          : null;

    return {
      provider: "sentry",
      externalId: id,
      fingerprint,
      severity: parseSeverity(severity),
      title: title.slice(0, 500),
      body: [
        title,
        typeof issue.culprit === "string" ? `culprit: ${issue.culprit}` : null,
        project ? `project: ${project}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      repoHint: project,
      urls: url ? [url] : [],
      labels: ["sentry", level],
      rawRef: JSON.stringify({
        id,
        fingerprint: fpArr,
        level,
        project,
      }).slice(0, 2000),
    };
  }
}
