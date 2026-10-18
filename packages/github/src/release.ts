/**
 * Release Assistant — create GitHub Release + notes under maintainer policy.
 */

export type GithubReleaseResult = {
  id: number;
  htmlUrl: string;
  tagName: string;
};

export async function createGithubRelease(input: {
  token: string;
  owner: string;
  repo: string;
  tagName: string;
  name: string;
  body: string;
  targetCommitish?: string;
  draft?: boolean;
  prerelease?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<GithubReleaseResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/releases`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag_name: input.tagName,
        name: input.name,
        body: input.body,
        target_commitish: input.targetCommitish,
        draft: input.draft ?? false,
        prerelease: input.prerelease ?? false,
        generate_release_notes: true,
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `createGithubRelease failed (${res.status}): ${errBody.slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as {
    id: number;
    html_url: string;
    tag_name: string;
  };
  return {
    id: body.id,
    htmlUrl: body.html_url,
    tagName: body.tag_name,
  };
}

/** Build a simple changelog body from merged PR titles. */
export function formatReleaseNotes(input: {
  version: string;
  highlights: string[];
}): string {
  const lines = input.highlights.length
    ? input.highlights.map((h) => `- ${h}`)
    : ["- Maintainer cycle ship"];
  return `## ${input.version}\n\n${lines.join("\n")}\n\n_Shipped by Coppergate maintainer._\n`;
}
