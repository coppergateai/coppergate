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

function bucketHighlight(title: string): "features" | "fixes" | "other" {
  const t = title.toLowerCase();
  if (/\b(fix|bug|hotfix|revert|security|cve)\b/.test(t)) return "fixes";
  if (
    /\b(feat|feature|add|ship|provider|docs?|content|ux|perf)\b/.test(t) ||
    /\b(P|W|A|S|AG|RT)-\d+/i.test(title)
  ) {
    return "features";
  }
  return "other";
}

/** Build a user-facing changelog body from merged PR / task titles. */
export function formatReleaseNotes(input: {
  version: string;
  highlights: string[];
}): string {
  const features: string[] = [];
  const fixes: string[] = [];
  const other: string[] = [];
  for (const h of input.highlights) {
    const line = h.trim();
    if (!line) continue;
    const bucket = bucketHighlight(line);
    if (bucket === "features") features.push(line);
    else if (bucket === "fixes") fixes.push(line);
    else other.push(line);
  }

  const sections: string[] = [`## ${input.version}`, ``];
  if (features.length) {
    sections.push(`### What's new`, ...features.map((h) => `- ${h}`), ``);
  }
  if (fixes.length) {
    sections.push(`### Fixes`, ...fixes.map((h) => `- ${h}`), ``);
  }
  if (other.length || (!features.length && !fixes.length)) {
    const rows = other.length ? other : ["Maintainer cycle ship"];
    sections.push(`### Changes`, ...rows.map((h) => `- ${h}`), ``);
  }
  sections.push(`_Shipped by Coppergate maintainer._`, ``);
  return sections.join("\n");
}
