import type { SignalAdapter, SignalEnvelope } from "./types.js";
import { parseSeverity } from "./types.js";
import { verifySharedSecret } from "./verify.js";

/**
 * SonarQube / SonarCloud webhook normalizer (TASK068).
 * Accepts Sonar-style JSON or a simplified Coppergate envelope.
 */
export class SonarSignalAdapter implements SignalAdapter {
  readonly provider = "sonar";

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

    // Simplified envelope (tests / owner ingest)
    if (typeof parsed.externalId === "string" && typeof parsed.title === "string") {
      return {
        provider: "sonar",
        externalId: parsed.externalId,
        fingerprint:
          typeof parsed.fingerprint === "string"
            ? parsed.fingerprint
            : `sonar:${parsed.externalId}`,
        severity: parseSeverity(parsed.severity),
        title: parsed.title.slice(0, 500),
        body: typeof parsed.body === "string" ? parsed.body : parsed.title,
        repoHint:
          typeof parsed.repoHint === "string" ? parsed.repoHint : null,
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((u): u is string => typeof u === "string")
          : [],
        labels: ["sonar"],
        rawRef: JSON.stringify({ kind: "simple", id: parsed.externalId }).slice(
          0,
          2000,
        ),
      };
    }

    const status = parsed.status as Record<string, unknown> | undefined;
    const project = parsed.project as Record<string, unknown> | undefined;
    const qualityGate = parsed.qualityGate as
      | Record<string, unknown>
      | undefined;
    const serverUrl =
      typeof parsed.serverUrl === "string" ? parsed.serverUrl : null;

    const projectKey =
      (typeof project?.key === "string" ? project.key : null) ??
      (typeof parsed.projectKey === "string" ? parsed.projectKey : null);

    const gateStatus =
      (typeof qualityGate?.status === "string"
        ? qualityGate.status
        : null) ??
      (typeof status?.qualityGate === "string" ? status.qualityGate : null) ??
      (typeof parsed.qualityGateStatus === "string"
        ? parsed.qualityGateStatus
        : null);

    const taskId =
      typeof parsed.taskId === "string"
        ? parsed.taskId
        : typeof status?.taskId === "string"
          ? status.taskId
          : null;

    if (!projectKey && !taskId) return null;

    const failed = (gateStatus ?? "").toUpperCase() === "ERROR" ||
      (gateStatus ?? "").toUpperCase() === "FAILED";
    if (!failed && gateStatus) {
      // Only arm on gate failure by default; still normalize for inbox.
    }

    const externalId =
      taskId ?? `${projectKey}:${gateStatus ?? "event"}:${Date.now()}`;
    const fingerprint = `sonar:qg:${projectKey ?? "unknown"}:${gateStatus ?? "unknown"}`;
    const title = failed
      ? `Sonar quality gate failed: ${projectKey ?? "project"}`
      : `Sonar event: ${projectKey ?? "project"} (${gateStatus ?? "unknown"})`;

    const urls: string[] = [];
    if (serverUrl && projectKey) {
      urls.push(`${serverUrl.replace(/\/$/, "")}/dashboard?id=${encodeURIComponent(projectKey)}`);
    }

    return {
      provider: "sonar",
      externalId,
      fingerprint,
      severity: failed ? "high" : "info",
      title,
      body: title,
      repoHint: projectKey,
      urls,
      labels: failed ? ["sonar", "quality_gate", "failed"] : ["sonar"],
      rawRef: JSON.stringify({
        projectKey,
        gateStatus,
        taskId,
      }).slice(0, 2000),
    };
  }
}

/** Fitness helper: quality gate failed ⇒ score 0 contribution. */
export function sonarFitnessFromGateStatus(
  gateStatus: string | null | undefined,
): { passed: boolean | null; score: number } {
  if (!gateStatus) return { passed: null, score: 0.1 };
  const s = gateStatus.toUpperCase();
  if (s === "OK" || s === "PASSED" || s === "SUCCESS") {
    return { passed: true, score: 0.2 };
  }
  if (s === "ERROR" || s === "FAILED" || s === "FAIL") {
    return { passed: false, score: 0 };
  }
  return { passed: null, score: 0.05 };
}
