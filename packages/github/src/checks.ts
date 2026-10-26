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

/** Classic commit status webhook (`status` event) — Vercel often uses this. */
export function mapCommitStatusPayload(payload: {
  state?: string;
  context?: string;
  target_url?: string | null;
  sha?: string;
  repository?: { full_name?: string };
}): NormalizedCheckEvidence {
  const state = (payload.state ?? "unknown").toLowerCase();
  const completed = state === "success" || state === "failure" || state === "error";
  const conclusion =
    state === "success"
      ? "success"
      : state === "failure" || state === "error"
        ? "failure"
        : state === "pending"
          ? null
          : state;
  const blocksAccept = completed && (state === "failure" || state === "error");
  const passed = completed && state === "success";

  return {
    provider: "github_check_run",
    checkRunId: null,
    name: payload.context ?? "status",
    status: completed ? "completed" : state,
    conclusion,
    blocksAccept,
    passed,
    headSha: payload.sha ?? null,
    detailsUrl: payload.target_url ?? null,
    repoFullName: payload.repository?.full_name ?? null,
  };
}

type GhCheckRun = {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  details_url?: string | null;
  head_sha?: string;
};

type GhCommitStatus = {
  context?: string;
  state?: string;
  target_url?: string | null;
};

/** Poll GitHub for check runs + commit statuses on a SHA (webhook miss recovery). */
export async function fetchCommitCheckEvidence(input: {
  token: string;
  owner: string;
  repo: string;
  headSha: string;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedCheckEvidence[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${input.token}`,
    "User-Agent": "coppergate-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const repoFullName = `${input.owner}/${input.repo}`;
  const out: NormalizedCheckEvidence[] = [];

  const checksRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/commits/${encodeURIComponent(input.headSha)}/check-runs?per_page=50`,
    { headers },
  );
  if (checksRes.ok) {
    const body = (await checksRes.json()) as { check_runs?: GhCheckRun[] };
    for (const cr of body.check_runs ?? []) {
      out.push(
        mapCheckRunPayload({
          check_run: {
            id: cr.id,
            name: cr.name,
            status: cr.status,
            conclusion: cr.conclusion,
            details_url: cr.details_url,
            head_sha: cr.head_sha ?? input.headSha,
          },
          repository: { full_name: repoFullName },
        }),
      );
    }
  }

  const statusRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/commits/${encodeURIComponent(input.headSha)}/status`,
    { headers },
  );
  if (statusRes.ok) {
    const body = (await statusRes.json()) as {
      statuses?: GhCommitStatus[];
      state?: string;
    };
    for (const st of body.statuses ?? []) {
      out.push(
        mapCommitStatusPayload({
          state: st.state,
          context: st.context,
          target_url: st.target_url,
          sha: input.headSha,
          repository: { full_name: repoFullName },
        }),
      );
    }
    // Combined rollup when statuses array empty but overall state known
    if ((body.statuses?.length ?? 0) === 0 && body.state && body.state !== "pending") {
      out.push(
        mapCommitStatusPayload({
          state: body.state,
          context: "combined",
          sha: input.headSha,
          repository: { full_name: repoFullName },
        }),
      );
    }
  }

  return out;
}

const GH_API_HEADERS = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "coppergate-worker",
  "X-GitHub-Api-Version": "2022-11-28",
});

/** True when any completed check suite on the SHA failed or timed out. */
export async function commitCheckSuitesFailed(input: {
  token: string;
  owner: string;
  repo: string;
  sha: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/commits/${encodeURIComponent(input.sha)}/check-suites`,
    { headers: GH_API_HEADERS(input.token) },
  );
  if (!res.ok) return false;
  const body = (await res.json()) as {
    check_suites?: Array<{ conclusion?: string | null; status?: string }>;
  };
  const suites = body.check_suites ?? [];
  if (suites.length === 0) return false;
  return suites.some(
    (s) =>
      s.status === "completed" &&
      (s.conclusion === "failure" || s.conclusion === "timed_out"),
  );
}

/** Default branch tip SHA for a repo (null when the API call fails). */
export async function getRepoDefaultBranchHead(input: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}): Promise<{ defaultBranch: string; sha: string } | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = GH_API_HEADERS(input.token);
  const repoRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}`,
    { headers },
  );
  if (!repoRes.ok) return null;
  const repoBody = (await repoRes.json()) as { default_branch?: string };
  const defaultBranch = repoBody.default_branch;
  if (!defaultBranch) return null;
  const refRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
    { headers },
  );
  if (!refRes.ok) return null;
  const refBody = (await refRes.json()) as { object?: { sha?: string } };
  const sha = refBody.object?.sha;
  if (!sha) return null;
  return { defaultBranch, sha };
}

/** Open Coppergate ship-rollback PRs (title: Revert: … (CI red on main)). */
export async function countOpenShipRollbackPrs(input: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}): Promise<number> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const q = encodeURIComponent(
    `repo:${input.owner}/${input.repo} is:pr is:open "CI red on main" in:title`,
  );
  const res = await fetchImpl(
    `https://api.github.com/search/issues?q=${q}&per_page=1`,
    { headers: GH_API_HEADERS(input.token) },
  );
  if (!res.ok) return 0;
  const body = (await res.json()) as { total_count?: number };
  return typeof body.total_count === "number" ? body.total_count : 0;
}
