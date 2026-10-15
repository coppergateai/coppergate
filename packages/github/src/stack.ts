import {
  inferStackFromSignals,
  type LanguageBytes,
  type StackDetectionResult,
  type StackFileSignals,
} from "@coppergate/scm";

type FetchLike = typeof fetch;

async function fetchRootFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as {
    type?: string;
    encoding?: string;
    content?: string;
  };
  if (body.type !== "file" || !body.content) return null;
  if (body.encoding === "base64") {
    return Buffer.from(body.content.replace(/\n/g, ""), "base64").toString(
      "utf8",
    );
  }
  return body.content;
}

async function fileExists(
  token: string,
  owner: string,
  repo: string,
  path: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    {
      method: "HEAD",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.ok) return true;
  // Some GitHub responses reject HEAD — fall back to GET metadata.
  if (res.status === 404 || res.status === 405 || res.status === 403) {
    if (res.status === 404) return false;
    const text = await fetchRootFile(token, owner, repo, path, fetchImpl);
    return text != null;
  }
  return false;
}

async function fetchLanguages(
  token: string,
  owner: string,
  repo: string,
  fetchImpl: FetchLike,
): Promise<LanguageBytes | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/languages`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as LanguageBytes;
}

async function probeCsprojOrSln(
  token: string,
  owner: string,
  repo: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) return false;
  const body = (await res.json()) as {
    tree?: Array<{ path?: string; type?: string }>;
  };
  return (body.tree ?? []).some(
    (e) =>
      e.type === "blob" &&
      typeof e.path === "string" &&
      !e.path.includes("/") &&
      (e.path.endsWith(".csproj") || e.path.endsWith(".sln")),
  );
}

/**
 * Detect project stack for a GitHub repository via root files + Languages API.
 */
export async function detectGithubRepoStack(
  token: string,
  owner: string,
  repo: string,
  fetchImpl: FetchLike = fetch,
): Promise<StackDetectionResult> {
  const packageJson = await fetchRootFile(
    token,
    owner,
    repo,
    "package.json",
    fetchImpl,
  );

  const [
    hasGoMod,
    hasCargoToml,
    hasPyproject,
    hasRequirementsTxt,
    hasSetupPy,
    hasGemfile,
    hasPomXml,
    hasBuildGradle,
    hasComposerJson,
  ] = await Promise.all([
    fileExists(token, owner, repo, "go.mod", fetchImpl),
    fileExists(token, owner, repo, "Cargo.toml", fetchImpl),
    fileExists(token, owner, repo, "pyproject.toml", fetchImpl),
    fileExists(token, owner, repo, "requirements.txt", fetchImpl),
    fileExists(token, owner, repo, "setup.py", fetchImpl),
    fileExists(token, owner, repo, "Gemfile", fetchImpl),
    fileExists(token, owner, repo, "pom.xml", fetchImpl),
    fileExists(token, owner, repo, "build.gradle", fetchImpl),
    fileExists(token, owner, repo, "composer.json", fetchImpl),
  ]);

  const files: StackFileSignals = {
    packageJson,
    hasGoMod,
    hasCargoToml,
    hasPyproject,
    hasRequirementsTxt,
    hasSetupPy,
    hasGemfile,
    hasPomXml,
    hasBuildGradle,
    hasComposerJson,
  };

  const early = inferStackFromSignals(files);
  if (early.source === "files") {
    return early;
  }

  files.hasCsprojOrSln = await probeCsprojOrSln(
    token,
    owner,
    repo,
    fetchImpl,
  );
  if (files.hasCsprojOrSln) {
    return inferStackFromSignals(files);
  }

  const languages = await fetchLanguages(token, owner, repo, fetchImpl);
  return inferStackFromSignals(files, languages);
}
