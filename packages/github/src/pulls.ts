export type GithubPullSummary = {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  state: string;
  headRef: string;
  baseRef: string;
};

export type GithubPullFileSummary = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
};

export type GithubPullContext = GithubPullSummary & {
  files: GithubPullFileSummary[];
};

export async function listOpenPulls(input: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubPullSummary[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls?state=open&per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`listOpenPulls failed (${res.status})`);
  }
  const rows = (await res.json()) as Array<{
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    head?: { ref?: string };
    base?: { ref?: string };
  }>;
  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    body: r.body,
    htmlUrl: r.html_url,
    state: r.state,
    headRef: r.head?.ref ?? "",
    baseRef: r.base?.ref ?? "",
  }));
}

/** Light PR state for WAITING_CI recovery + merge-conflict heal (AG-032). */
export type GithubPullMergeState = {
  number: number;
  state: string;
  merged: boolean;
  /** null while GitHub is still computing mergeability. */
  mergeable: boolean | null;
  /** clean | dirty | unstable | blocked | unknown | … */
  mergeableState: string | null;
  headRef: string | null;
  headSha: string | null;
  baseRef: string | null;
};

export async function getPullRequestMergeState(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  fetchImpl?: typeof fetch;
}): Promise<GithubPullMergeState> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${input.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const prRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}`,
    { headers },
  );
  if (!prRes.ok) {
    throw new Error(`getPullRequestMergeState failed (${prRes.status})`);
  }
  const pr = (await prRes.json()) as {
    number: number;
    state: string;
    merged?: boolean;
    mergeable?: boolean | null;
    mergeable_state?: string | null;
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
  };
  return {
    number: pr.number,
    state: pr.state,
    merged: pr.merged === true,
    mergeable: typeof pr.mergeable === "boolean" ? pr.mergeable : null,
    mergeableState:
      typeof pr.mergeable_state === "string" ? pr.mergeable_state : null,
    headRef: pr.head?.ref ?? null,
    headSha: pr.head?.sha ?? null,
    baseRef: pr.base?.ref ?? null,
  };
}

export async function getPullRequestContext(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  fetchImpl?: typeof fetch;
}): Promise<GithubPullContext> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${input.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const prRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}`,
    { headers },
  );
  if (!prRes.ok) {
    throw new Error(`getPullRequestContext failed (${prRes.status})`);
  }
  const pr = (await prRes.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    head?: { ref?: string };
    base?: { ref?: string };
  };

  const filesRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}/files?per_page=100`,
    { headers },
  );
  const filesRaw = filesRes.ok
    ? ((await filesRes.json()) as Array<{
        filename: string;
        status: string;
        additions?: number;
        deletions?: number;
      }>)
    : [];

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    htmlUrl: pr.html_url,
    state: pr.state,
    headRef: pr.head?.ref ?? "",
    baseRef: pr.base?.ref ?? "",
    files: filesRaw.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
    })),
  };
}

/**
 * AG-036 — update a behind PR head onto its base (GitHub "Update branch").
 * 202 → updated; 422 with conflict → caller should arm merge_conflict Fixer.
 */
export async function updatePullRequestBranch(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  expectedHeadSha?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{
  updated: boolean;
  conflict: boolean;
  message: string;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body: { expected_head_sha?: string } = {};
  const sha = input.expectedHeadSha?.trim();
  if (sha) body.expected_head_sha = sha;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}/update-branch`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300);
  try {
    const json = JSON.parse(text) as { message?: string };
    if (typeof json.message === "string") message = json.message;
  } catch {
    /* plain text */
  }
  if (res.status === 202 || res.status === 200) {
    return { updated: true, conflict: false, message: message || "updated" };
  }
  const lower = message.toLowerCase();
  const conflict =
    res.status === 422 &&
    (lower.includes("conflict") || lower.includes("merge conflict"));
  return {
    updated: false,
    conflict,
    message: message || `update-branch failed (${res.status})`,
  };
}

export async function submitPullRequestReview(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  body: string;
  event?: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  fetchImpl?: typeof fetch;
}): Promise<{ id: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}/reviews`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: input.body.slice(0, 65_000),
        event: input.event ?? "COMMENT",
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `submitPullRequestReview failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  const json = (await res.json()) as { id?: number };
  return { id: json.id ?? 0 };
}
