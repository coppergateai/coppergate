export type GithubIssueSummary = {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  state: string;
};

export async function listOpenIssues(input: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubIssueSummary[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues?state=open&per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`listOpenIssues failed (${res.status})`);
  }
  const rows = (await res.json()) as Array<{
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    pull_request?: unknown;
  }>;
  return rows
    .filter((r) => !r.pull_request)
    .map((r) => ({
      number: r.number,
      title: r.title,
      body: r.body,
      htmlUrl: r.html_url,
      state: r.state,
    }));
}

export async function mergePullRequest(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  fetchImpl?: typeof fetch;
}): Promise<{ merged: boolean; sha: string | null; message: string }> {
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
