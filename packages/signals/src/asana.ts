import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * Thin Asana task webhook adapter (TASK086).
 * ClickUp / Shortcut can reuse the same simple envelope shape.
 */
export class AsanaSignalAdapter implements SignalAdapter {
  readonly provider = "asana";

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
        provider: "asana",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `asana:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "medium"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: ["asana"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    // Asana events webhook: { events: [{ resource: { gid, name, resource_type } }] }
    const events = parsed.events as Array<Record<string, unknown>> | undefined;
    const first = events?.[0];
    const resource =
      (first?.resource as Record<string, unknown> | undefined) ??
      (parsed.data as Record<string, unknown> | undefined) ??
      (parsed.resource as Record<string, unknown> | undefined);
    if (!resource) return null;

    const gid =
      typeof resource.gid === "string"
        ? resource.gid
        : resource.gid != null
          ? String(resource.gid)
          : typeof parsed.gid === "string"
            ? parsed.gid
            : null;
    const name =
      typeof resource.name === "string"
        ? resource.name
        : typeof parsed.name === "string"
          ? parsed.name
          : null;
    if (!gid || !name) return null;

    const action =
      typeof first?.action === "string" ? first.action : "changed";

    return {
      provider: "asana",
      externalId: gid,
      fingerprint: `asana:${gid}`,
      severity: parseSeverity("medium"),
      title: name.slice(0, 500),
      body: name,
      urls: [`https://app.asana.com/0/0/${gid}`],
      labels: ["asana", action],
      rawRef: JSON.stringify({ gid, action }).slice(0, 2000),
    };
  }
}

/** Thin ClickUp stub — same envelope contract as Asana (TASK086). */
export class ClickUpSignalAdapter implements SignalAdapter {
  readonly provider = "clickup";

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
        provider: "clickup",
        externalId: parsed.externalId,
        fingerprint: `clickup:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity ?? "medium"),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        labels: ["clickup"],
        rawRef: JSON.stringify({ kind: "simple" }).slice(0, 2000),
      };
    }

    const taskId =
      typeof parsed.task_id === "string"
        ? parsed.task_id
        : typeof (parsed.task as { id?: string } | undefined)?.id === "string"
          ? (parsed.task as { id: string }).id
          : null;
    const name =
      typeof parsed.name === "string"
        ? parsed.name
        : typeof (parsed.task as { name?: string } | undefined)?.name ===
            "string"
          ? (parsed.task as { name: string }).name
          : null;
    if (!taskId || !name) return null;

    return {
      provider: "clickup",
      externalId: taskId,
      fingerprint: `clickup:${taskId}`,
      severity: parseSeverity("medium"),
      title: name.slice(0, 500),
      body: name,
      labels: ["clickup"],
      rawRef: JSON.stringify({ taskId }).slice(0, 2000),
    };
  }
}
