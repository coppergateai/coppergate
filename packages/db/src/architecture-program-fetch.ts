/**
 * Fetch bound Open Program markdown from GitHub (no maintainer/task-transitions deps).
 * AG-020 — fail-closed diagnostics when token/404/misconfig empty the board invent path.
 */

/** Default architecture markdown paths (primary-capable Open IDs first). */
export const DEFAULT_ARCHITECTURE_PATHS =
  "PROVIDER-TASKS.md,RUNTIME-TASKS.md,AGENT-TASKS.md,APP-TASKS.md,WEBSITE-TASKS.md,CONTENT-PLAN.md";

export type ArchitectureFetchFailureCode =
  | "misconfigured_repo"
  | "bad_token"
  | "not_found"
  | "network"
  | "empty";

export type ArchitectureFetchFailure = {
  code: ArchitectureFetchFailureCode;
  message: string;
  repo: string;
  paths: string[];
  /** Last non-OK HTTP status seen (if any). */
  httpStatus?: number;
};

export type ArchitectureFetchResult = {
  markdown: string;
  /** True when at least one path returned a file body. */
  ok: boolean;
  failure?: ArchitectureFetchFailure;
};

type FetchOpts = {
  token?: string | null;
  repo?: string | null;
  paths?: string | null;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
};

function normalizeOpts(
  tokenOrOpts?: string | null | FetchOpts,
): FetchOpts {
  if (typeof tokenOrOpts === "string" || tokenOrOpts == null) {
    return { token: tokenOrOpts };
  }
  return tokenOrOpts;
}

function resolveRepoAndPaths(opts: FetchOpts): {
  repo: string;
  owner: string;
  name: string;
  paths: string[];
} | { error: ArchitectureFetchFailure } {
  const repo =
    opts.repo?.trim() ||
    process.env.ARCHITECTURE_REPO?.trim() ||
    "kprompt/kprompt-architecture";
  const [owner, name] = repo.split("/");
  const paths = (
    opts.paths?.trim() ||
    process.env.ARCHITECTURE_PATHS?.trim() ||
    DEFAULT_ARCHITECTURE_PATHS
  )
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!owner || !name || paths.length === 0) {
    return {
      error: {
        code: "misconfigured_repo",
        message:
          "Architecture repo/paths misconfigured — set architectureRepo + architecturePaths (or ARCHITECTURE_REPO / ARCHITECTURE_PATHS).",
        repo,
        paths,
      },
    };
  }
  return { repo, owner, name, paths };
}

/**
 * Classify fetch outcomes when no markdown body was collected (AG-020).
 * Prefer auth failures over 404 over network over empty.
 */
export function classifyArchitectureFetchFailure(input: {
  repo: string;
  paths: string[];
  statuses: number[];
  networkErrors: number;
}): ArchitectureFetchFailure {
  const { repo, paths, statuses, networkErrors } = input;
  if (statuses.some((s) => s === 401 || s === 403)) {
    return {
      code: "bad_token",
      message:
        "Architecture GitHub token rejected (401/403) — re-bind Open Program credentials in project Settings.",
      repo,
      paths,
      httpStatus: statuses.find((s) => s === 401 || s === 403),
    };
  }
  if (statuses.length > 0 && statuses.every((s) => s === 404)) {
    return {
      code: "not_found",
      message:
        "Architecture markdown paths returned 404 — re-bind Open Program path (architecturePaths) in project Settings.",
      repo,
      paths,
      httpStatus: 404,
    };
  }
  if (statuses.length > 0 && statuses.every((s) => !Number.isFinite(s) || s >= 400)) {
    const httpStatus = statuses[0];
    return {
      code: "not_found",
      message: `Architecture markdown fetch failed (HTTP ${httpStatus}) — re-bind Open Program path in project Settings.`,
      repo,
      paths,
      httpStatus,
    };
  }
  if (networkErrors > 0 && statuses.length === 0) {
    return {
      code: "network",
      message:
        "Architecture markdown fetch network error — retry later or re-bind Open Program path.",
      repo,
      paths,
    };
  }
  return {
    code: "empty",
    message:
      "Architecture paths returned no file bodies — re-bind Open Program path or check the bound markdown.",
    repo,
    paths,
  };
}

/**
 * Fetch architecture Open Program markdown with fail-closed diagnostics (AG-020).
 */
export async function fetchArchitectureBacklogMarkdownResult(
  tokenOrOpts?: string | null | FetchOpts,
): Promise<ArchitectureFetchResult> {
  const opts = normalizeOpts(tokenOrOpts);
  const resolved = resolveRepoAndPaths(opts);
  if ("error" in resolved) {
    return { markdown: "", ok: false, failure: resolved.error };
  }
  const { repo, owner, name, paths } = resolved;

  const token =
    opts.token?.trim() ||
    process.env.ARCHITECTURE_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    null;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const chunks: string[] = [];
  const statuses: number[] = [];
  let networkErrors = 0;

  for (const path of paths) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "coppergate-maintainer",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetchImpl(
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
        { headers },
      );
      if (!res.ok) {
        statuses.push(res.status);
        continue;
      }
      const body = (await res.json()) as {
        type?: string;
        encoding?: string;
        content?: string;
      };
      if (body.type !== "file" || !body.content) {
        statuses.push(204);
        continue;
      }
      const text =
        body.encoding === "base64"
          ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString(
              "utf8",
            )
          : body.content;
      chunks.push(`# ${path}\n${text}`);
    } catch {
      networkErrors += 1;
    }
  }

  const markdown = chunks.join("\n\n");
  if (chunks.length > 0) {
    return { markdown, ok: true };
  }

  return {
    markdown: "",
    ok: false,
    failure: classifyArchitectureFetchFailure({
      repo,
      paths,
      statuses,
      networkErrors,
    }),
  };
}

/**
 * Best-effort load of architecture Open Program markdown from GitHub.
 * Prefer per-project repo/paths, then ARCHITECTURE_REPO / ARCHITECTURE_PATHS env.
 * Returns "" on failure (callers that invent must use Result + AG-020 skip).
 */
export async function fetchArchitectureBacklogMarkdown(
  tokenOrOpts?: string | null | FetchOpts,
): Promise<string> {
  const result = await fetchArchitectureBacklogMarkdownResult(tokenOrOpts);
  return result.markdown;
}
