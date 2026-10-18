/**
 * GitHub community ops for maintainer mode — labels, issue comments, Discussions stub.
 */

export type GithubIssueCommentResult = {
  id: number;
  htmlUrl: string;
};

export async function addIssueComment(input: {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubIssueCommentResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: input.body }),
    },
  );
  if (!res.ok) {
    throw new Error(`addIssueComment failed (${res.status})`);
  }
  const body = (await res.json()) as { id: number; html_url: string };
  return { id: body.id, htmlUrl: body.html_url };
}

export async function setIssueLabels(input: {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  labels: string[];
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/labels`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labels: input.labels }),
    },
  );
  if (!res.ok) {
    throw new Error(`setIssueLabels failed (${res.status})`);
  }
  const body = (await res.json()) as Array<{ name: string }>;
  return body.map((l) => l.name);
}

export async function createDiscussionComment(input: {
  token: string;
  /** GraphQL node id of the discussion */
  discussionId: string;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<{ commentId: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const query = `
    mutation($discussionId: ID!, $body: String!) {
      addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
        comment { id }
      }
    }
  `;
  const res = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        discussionId: input.discussionId,
        body: input.body,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`createDiscussionComment failed (${res.status})`);
  }
  const json = (await res.json()) as {
    data?: { addDiscussionComment?: { comment?: { id: string } } };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }
  const commentId = json.data?.addDiscussionComment?.comment?.id;
  if (!commentId) {
    throw new Error("Discussion comment id missing");
  }
  return { commentId };
}
