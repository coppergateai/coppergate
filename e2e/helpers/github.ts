import { githubPrLimit, githubRepo, githubToken } from "./env.js";

export type GitHubPull = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  user?: { login?: string } | null;
  head?: { ref?: string } | null;
  base?: { ref?: string } | null;
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
};

export async function fetchGitHubPulls(opts?: {
  state?: "open" | "closed" | "all";
  limit?: number;
}): Promise<{ repo: string; pulls: GitHubPull[] }> {
  const repo = githubRepo();
  const limit = opts?.limit ?? githubPrLimit();
  const state = opts?.state ?? "all";
  const token = githubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "coppergate-e2e",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${repo}/pulls?state=${state}&per_page=${Math.min(limit, 100)}&sort=updated&direction=desc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API ${res.status} for ${repo}: ${body.slice(0, 400)}`,
    );
  }
  const pulls = (await res.json()) as GitHubPull[];
  return { repo, pulls: pulls.slice(0, limit) };
}
