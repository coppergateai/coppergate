/**
 * Fetch bound Open Program markdown from GitHub (no maintainer/task-transitions deps).
 */

/** Default architecture markdown paths (primary-capable Open IDs first). */
export const DEFAULT_ARCHITECTURE_PATHS =
  "PROVIDER-TASKS.md,RUNTIME-TASKS.md,AGENT-TASKS.md,APP-TASKS.md,WEBSITE-TASKS.md,CONTENT-PLAN.md";

export type ArchitectureFetchOpts = {
  token?: string | null;
  repo?: string | null;
  paths?: string | null;
};

export type ArchitectureFetchErrorCode =
  | "bad_token"
  | "program_not_found"
  | "repo_not_found"
  | "forbidden"
  | "fetch_failed";

export type ArchitectureProgramFetchResult =
  | { ok: true; markdown: string }
  | {
      ok: false;
      error: ArchitectureFetchErrorCode;
      detail: string;
      httpStatus?: number;
    };

function normalizeFetchOpts(
  tokenOrOpts?:
    | string
    | null
    | ArchitectureFetchOpts,
): ArchitectureFetchOpts {
  return typeof tokenOrOpts === "string" || tokenOrOpts == null
    ? { token: tokenOrOpts }
    : tokenOrOpts;
}

function resolveFetchParams(opts: ArchitectureFetchOpts): {
  token: string | null;
  owner: string;
  name: string;
  paths: string[];
} | null {
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
  if (!owner || !name) return null;

  const paths = (
    opts.paths?.trim() ||
    process.env.ARCHITECTURE_PATHS?.trim() ||
    DEFAULT_ARCHITECTURE_PATHS
  )
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);

  return { token, owner, name, paths };
}

function classifyHttpFailure(
  status: number,
  hadToken: boolean,
): ArchitectureFetchErrorCode {
  if (status === 401) return "bad_token";
  if (status === 403) return hadToken ? "bad_token" : "forbidden";
  if (status === 404) return "program_not_found";
  return "fetch_failed";
}

/** Operator-facing copy for backlog / Mission Control (no invented rows). */
export function describeArchitectureFetchFailure(
  failure: Extract<ArchitectureProgramFetchResult, { ok: false }>,
): string {
  switch (failure.error) {
    case "bad_token":
      return "Could not load Open Program markdown — GitHub rejected the token. Re-install the GitHub App or fix credentials, then re-bind the Program path.";
    case "program_not_found":
      return "Could not load Open Program markdown — path returned 404. Re-bind architectureRepo and Program path(s) on Configuration.";
    case "repo_not_found":
      return "Could not load Open Program markdown — repository not found. Re-bind architectureRepo on Configuration.";
    case "forbidden":
      return "Could not load Open Program markdown — GitHub forbids access. Confirm App installation on the architecture repo and re-bind the Program path.";
    default:
      return failure.detail.slice(0, 240);
  }
}

/**
 * Fail-closed fetch of architecture Open Program markdown (AG-020).
 * Bad token or missing markdown paths → structured error (never silent empty).
 */
export async function fetchArchitectureProgram(
  tokenOrOpts?:
    | string
    | null
    | ArchitectureFetchOpts,
): Promise<ArchitectureProgramFetchResult> {
  const opts = normalizeFetchOpts(tokenOrOpts);
  const resolved = resolveFetchParams(opts);
  if (!resolved) {
    return {
      ok: false,
      error: "repo_not_found",
      detail: "Invalid architectureRepo (expected owner/name)",
    };
  }
  const { token, owner, name, paths } = resolved;
  if (paths.length === 0) {
    return {
      ok: false,
      error: "program_not_found",
      detail: "No Program path configured",
    };
  }

  const chunks: string[] = [];
  let saw404 = false;
  let saw401 = false;
  let saw403 = false;
  let lastStatus: number | undefined;

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
      lastStatus = res.status;
      if (res.status === 401) {
        saw401 = true;
        continue;
      }
      if (res.status === 403) {
        saw403 = true;
        continue;
      }
      if (res.status === 404) {
        saw404 = true;
        continue;
      }
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
    } catch (err) {
      const detail =
        err instanceof Error ? err.message.slice(0, 200) : "Network error";
      return { ok: false, error: "fetch_failed", detail };
    }
  }

  if (chunks.length > 0) {
    return { ok: true, markdown: chunks.join("\n\n") };
  }

  if (saw401) {
    return {
      ok: false,
      error: "bad_token",
      detail: "GitHub API returned 401 for architecture markdown",
      httpStatus: 401,
    };
  }
  if (saw403 && token) {
    return {
      ok: false,
      error: "bad_token",
      detail: "GitHub API returned 403 for architecture markdown",
      httpStatus: 403,
    };
  }
  if (saw403) {
    return {
      ok: false,
      error: "forbidden",
      detail: "GitHub API returned 403 for architecture markdown",
      httpStatus: 403,
    };
  }
  if (saw404) {
    return {
      ok: false,
      error: "program_not_found",
      detail: `No markdown at bound Program path(s) in ${owner}/${name}`,
      httpStatus: 404,
    };
  }

  const code = classifyHttpFailure(lastStatus ?? 0, Boolean(token));
  return {
    ok: false,
    error: code,
    detail:
      lastStatus != null
        ? `GitHub contents API returned ${lastStatus}`
        : "Architecture markdown fetch returned no content",
    httpStatus: lastStatus,
  };
}

/**
 * Best-effort load of architecture Open Program markdown from GitHub.
 * Prefer per-project repo/paths, then ARCHITECTURE_REPO / ARCHITECTURE_PATHS env.
 * Returns empty string when fetch fails (use {@link fetchArchitectureProgram} for fail-closed).
 */
export async function fetchArchitectureBacklogMarkdown(
  tokenOrOpts?:
    | string
    | null
    | ArchitectureFetchOpts,
): Promise<string> {
  const result = await fetchArchitectureProgram(tokenOrOpts);
  return result.ok ? result.markdown : "";
}
