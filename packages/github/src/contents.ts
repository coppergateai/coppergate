/**
 * GitHub Contents API helpers for architecture writeback + ship rollback.
 */

export type RepoFile = {
  path: string;
  content: string;
  sha: string;
};

export async function getRepoFile(input: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  ref?: string;
  fetchImpl?: typeof fetch;
}): Promise<RepoFile | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const q = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${encodeURIComponent(input.path).replace(/%2F/g, "/")}${q}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`getRepoFile failed (${res.status}) for ${input.path}`);
  }
  const body = (await res.json()) as {
    type?: string;
    encoding?: string;
    content?: string;
    sha?: string;
    path?: string;
  };
  if (body.type !== "file" || !body.content || !body.sha) return null;
  const content =
    body.encoding === "base64"
      ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8")
      : body.content;
  return { path: body.path ?? input.path, content, sha: body.sha };
}

export async function updateRepoFile(input: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  content: string;
  sha: string;
  message: string;
  branch?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ commitSha: string | null }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${encodeURIComponent(input.path).replace(/%2F/g, "/")}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        sha: input.sha,
        branch: input.branch,
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `updateRepoFile failed (${res.status}): ${errBody.slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as { commit?: { sha?: string } };
  return { commitSha: body.commit?.sha ?? null };
}

/**
 * Open a revert PR for a merged pull request via GraphQL revertPullRequest.
 */

/**
 * Create or replace a binary (or any) file via Contents API.
 * Omits sha when the path does not exist yet.
 */
export async function putRepoBinaryFile(input: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  content: Uint8Array | string;
  encoding?: "utf8" | "base64";
  message: string;
  branch?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ commitSha: string | null; contentPath: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const encodedPath = input.path
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const refQ = input.branch
    ? `?ref=${encodeURIComponent(input.branch)}`
    : "";
  const getRes = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${encodedPath}${refQ}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  let sha: string | undefined;
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha?: string };
    sha = existing.sha;
  }

  const content =
    input.encoding === "base64"
      ? typeof input.content === "string"
        ? input.content
        : Buffer.from(input.content).toString("base64")
      : typeof input.content === "string"
        ? Buffer.from(input.content, "utf8").toString("base64")
        : Buffer.from(input.content).toString("base64");

  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: input.message,
        content,
        branch: input.branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `putRepoBinaryFile failed (${res.status}): ${errBody.slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as {
    commit?: { sha?: string };
    content?: { path?: string };
  };
  return {
    commitSha: body.commit?.sha ?? null,
    contentPath: body.content?.path ?? input.path,
  };
}

export async function createRevertPullRequest(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  title?: string;
  body?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ number: number; htmlUrl: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${input.token}`,
    "User-Agent": "coppergate-maintainer",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  const idRes = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `query($owner:String!,$name:String!,$n:Int!){
        repository(owner:$owner,name:$name){
          pullRequest(number:$n){ id }
        }
      }`,
      variables: {
        owner: input.owner,
        name: input.repo,
        n: input.prNumber,
      },
    }),
  });
  if (!idRes.ok) {
    throw new Error(`createRevertPullRequest: graphql id failed (${idRes.status})`);
  }
  const idBody = (await idRes.json()) as {
    data?: { repository?: { pullRequest?: { id?: string } } };
    errors?: Array<{ message?: string }>;
  };
  const prNodeId = idBody.data?.repository?.pullRequest?.id;
  if (!prNodeId) {
    throw new Error(
      `createRevertPullRequest: missing PR node id (${idBody.errors?.[0]?.message ?? "unknown"})`,
    );
  }

  const title =
    input.title ?? `Revert Coppergate merge of #${input.prNumber}`;
  const body =
    input.body ??
    [
      `Automated ship rollback for #${input.prNumber}.`,
      ``,
      `Opened by Coppergate after post-merge CI failure or operator rollback request.`,
    ].join("\n");

  const revRes = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `mutation($input:RevertPullRequestInput!){
        revertPullRequest(input:$input){
          revertPullRequest { number url }
        }
      }`,
      variables: {
        input: {
          pullRequestId: prNodeId,
          title: title.slice(0, 200),
          body,
          draft: false,
        },
      },
    }),
  });
  if (!revRes.ok) {
    throw new Error(
      `createRevertPullRequest: mutation failed (${revRes.status})`,
    );
  }
  const revBody = (await revRes.json()) as {
    data?: {
      revertPullRequest?: {
        revertPullRequest?: { number?: number; url?: string };
      };
    };
    errors?: Array<{ message?: string }>;
  };
  const pr = revBody.data?.revertPullRequest?.revertPullRequest;
  if (!pr?.number || !pr.url) {
    throw new Error(
      `createRevertPullRequest: ${revBody.errors?.[0]?.message ?? "no revert PR"}`,
    );
  }
  return { number: pr.number, htmlUrl: pr.url };
}
