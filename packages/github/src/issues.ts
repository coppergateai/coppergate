import { assertDefaultBranchMergeAllowed } from "@coppergate/scm";

export type GithubIssueSummary = {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  state: string;
  labels: string[];
};

export async function listOpenIssues(input: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubIssueSummary[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues?state=open&per_page=50`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    const err = new Error(`listOpenIssues failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  const rows = (await res.json()) as Array<{
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    pull_request?: unknown;
    labels?: Array<{ name?: string } | string>;
  }>;
  return rows
    .filter((r) => !r.pull_request)
    .map((r) => ({
      number: r.number,
      title: r.title,
      body: r.body,
      htmlUrl: r.html_url,
      state: r.state,
      labels: (r.labels ?? []).map((l) =>
        typeof l === "string" ? l : (l.name ?? ""),
      ).filter(Boolean),
    }));
}

export async function createIssue(input: {
  token: string;
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  fetchImpl?: typeof fetch;
}): Promise<GithubIssueSummary> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body ?? "",
        labels: input.labels ?? [],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`createIssue failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    labels?: Array<{ name?: string } | string>;
  };
  return {
    number: body.number,
    title: body.title,
    body: body.body,
    htmlUrl: body.html_url,
    state: body.state,
    labels: (body.labels ?? []).map((l) =>
      typeof l === "string" ? l : (l.name ?? ""),
    ).filter(Boolean),
  };
}

export function countGoodFirstIssues(issues: GithubIssueSummary[]): number {
  return issues.filter((i) =>
    i.labels.some((l) => l.toLowerCase() === "good first issue"),
  ).length;
}

export async function mergePullRequest(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  /** SEC-036 — must be true (mergeEnabled + path) before any merge API call. */
  allowDefaultBranchWrite: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ merged: boolean; sha: string | null; message: string }> {
  try {
    assertDefaultBranchMergeAllowed({
      allowDefaultBranchWrite: input.allowDefaultBranchWrite,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Refusing merge to default branch without explicit policy flag";
    return { merged: false, sha: null, message };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}/merge`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merge_method: "squash",
        commit_title: `Coppergate: merge PR #${input.prNumber}`,
      }),
    },
  );
  if (res.status === 405 || res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      merged: false,
      sha: null,
      message: body.message ?? `merge not allowed (${res.status})`,
    };
  }
  if (!res.ok) {
    throw new Error(`mergePullRequest failed (${res.status})`);
  }
  const body = (await res.json()) as { merged?: boolean; sha?: string; message?: string };
  return {
    merged: Boolean(body.merged),
    sha: body.sha ?? null,
    message: body.message ?? "merged",
  };
}
