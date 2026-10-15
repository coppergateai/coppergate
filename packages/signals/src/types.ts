/** D13 — Signal Adapter contract (TASK062). */

export type SignalSeverity = "info" | "low" | "medium" | "high" | "critical";

export type SignalProvider =
  | "fake"
  | "sonar"
  | "ci_failure"
  | "jira"
  | "linear"
  | "sentry"
  | "codeql"
  | "semgrep"
  | "dependabot"
  | "trivy"
  | "pagerduty"
  | "datadog";

export type SignalEnvelope = {
  provider: SignalProvider | string;
  externalId: string;
  fingerprint: string;
  severity: SignalSeverity;
  title: string;
  body: string;
  repoHint?: string | null;
  urls?: string[];
  labels?: string[];
  projectHint?: string | null;
  /** Opaque provider payload ref / truncated JSON (never secrets). */
  rawRef?: string | null;
};

export type SignalVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

export type SignalAdapter = {
  readonly provider: string;
  verify(input: {
    rawBody: string;
    headers: Headers | Record<string, string | null | undefined>;
    secret?: string | null;
  }): SignalVerifyResult;
  normalize(input: {
    rawBody: string;
    headers?: Headers | Record<string, string | null | undefined>;
  }): SignalEnvelope | null;
};

export type SignalOutboundAction =
  | "comment"
  | "transition"
  | "resolve_alert";

export type SignalOutboundRequest = {
  provider: string;
  externalId: string;
  action: SignalOutboundAction;
  message: string;
  prUrl?: string | null;
  status?: string | null;
};

export type SignalOutbound = {
  sync(req: SignalOutboundRequest): Promise<{ ok: boolean; note?: string }>;
};

export const SEVERITY_RANK: Record<SignalSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function parseSeverity(raw: unknown): SignalSeverity {
  if (typeof raw !== "string") return "medium";
  const v = raw.toLowerCase();
  if (v === "info" || v === "low" || v === "medium" || v === "high" || v === "critical") {
    return v;
  }
  if (v === "blocker" || v === "block" || v === "fatal") return "critical";
  if (v === "major" || v === "error") return "high";
  if (v === "minor" || v === "warning" || v === "warn") return "medium";
  if (v === "trivial" || v === "note") return "low";
  return "medium";
}

export function severityAtLeast(
  actual: SignalSeverity,
  minimum: SignalSeverity,
): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[minimum];
}
