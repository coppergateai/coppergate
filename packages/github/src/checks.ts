/**
 * CI evidence mapping — TASK022.
 */

export type CheckRunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | string
  | null;

export type NormalizedCheckEvidence = {
  provider: "github_check_run";
  checkRunId: number | null;
  name: string;
  status: string;
  conclusion: CheckRunConclusion;
  /** true when conclusion indicates failure that must block ACCEPTED. */
  blocksAccept: boolean;
  /** true when checks are green enough to show as passing evidence. */
  passed: boolean;
  headSha: string | null;
  detailsUrl: string | null;
  repoFullName: string | null;
};

const BLOCKING = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
]);

export function mapCheckRunPayload(payload: {
  action?: string;
  check_run?: {
    id?: number;
    name?: string;
    status?: string;
    conclusion?: string | null;
    details_url?: string | null;
    head_sha?: string;
  };
  repository?: { full_name?: string };
}): NormalizedCheckEvidence {
  const cr = payload.check_run ?? {};
  const conclusion = (cr.conclusion ?? null) as CheckRunConclusion;
  const status = cr.status ?? "unknown";
  const completed = status === "completed";
  const blocksAccept = completed && conclusion != null && BLOCKING.has(conclusion);
  const passed = completed && conclusion === "success";

  return {
    provider: "github_check_run",
    checkRunId: cr.id ?? null,
    name: cr.name ?? "check",
    status,
    conclusion,
    blocksAccept,
    passed,
    headSha: cr.head_sha ?? null,
    detailsUrl: cr.details_url ?? null,
    repoFullName: payload.repository?.full_name ?? null,
  };
}

export type CheckSuitePayload = {
  action?: string;
  check_suite?: {
    id?: number;
    status?: string;
    conclusion?: string | null;
    head_sha?: string;
  };
  repository?: { full_name?: string };
};

export function mapCheckSuitePayload(
  payload: CheckSuitePayload,
): NormalizedCheckEvidence {
  const cs = payload.check_suite ?? {};
  const conclusion = (cs.conclusion ?? null) as CheckRunConclusion;
  const status = cs.status ?? "unknown";
  const completed = status === "completed";
  const blocksAccept = completed && conclusion != null && BLOCKING.has(conclusion);
  const passed = completed && conclusion === "success";

  return {
    provider: "github_check_run",
    checkRunId: cs.id ?? null,
    name: "check_suite",
    status,
    conclusion,
    blocksAccept,
    passed,
    headSha: cs.head_sha ?? null,
    detailsUrl: null,
    repoFullName: payload.repository?.full_name ?? null,
  };
}
