/**
 * Fetch bound Open Program markdown from GitHub (no maintainer/task-transitions deps).
 */

/** Default architecture markdown paths (primary-capable Open IDs first). */
export const DEFAULT_ARCHITECTURE_PATHS =
  "PROVIDER-TASKS.md,RUNTIME-TASKS.md,AGENT-TASKS.md,APP-TASKS.md,WEBSITE-TASKS.md,CONTENT-PLAN.md";

/**
 * Best-effort load of architecture Open Program markdown from GitHub.
 * Prefer per-project repo/paths, then ARCHITECTURE_REPO / ARCHITECTURE_PATHS env.
 */
export async function fetchArchitectureBacklogMarkdown(
  tokenOrOpts?:
    | string
    | null
    | {
        token?: string | null;
        repo?: string | null;
        paths?: string | null;
      },
): Promise<string> {
  const opts =
    typeof tokenOrOpts === "string" || tokenOrOpts == null
      ? { token: tokenOrOpts }
      : tokenOrOpts;
  const token =
    opts.token?.trim() ||
    process.env.ARCHITECTURE_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    null;

  const repo =
    opts.repo?.trim() ||
    process.env.ARCHITECTURE_REPO?.trim() ||
    "kprompt/kprompt-architecture";
  const [owner, name] = repo.split("/");
  if (!owner || !name) return "";

  const paths = (
    opts.paths?.trim() ||
    process.env.ARCHITECTURE_PATHS?.trim() ||
    DEFAULT_ARCHITECTURE_PATHS
  )
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);

  const chunks: string[] = [];
  for (const path of paths) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
        { headers },
      );
      if (!res.ok) continue;
      const body = (await res.json()) as {
        type?: string;
        encoding?: string;
        content?: string;
      };
      if (body.type !== "file" || !body.content) continue;
      const text =
        body.encoding === "base64"
          ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString(
              "utf8",
            )
          : body.content;
      chunks.push(`# ${path}\n${text}`);
    } catch {
      /* ignore per-file errors */
    }
  }
  return chunks.join("\n\n");
}
