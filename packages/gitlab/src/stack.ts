import {
  inferStackFromSignals,
  type LanguageBytes,
  type StackDetectionResult,
  type StackFileSignals,
} from "@coppergate/scm";
import { normalizeGitlabBaseUrl } from "./oauth.js";

type FetchLike = typeof fetch;

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    "PRIVATE-TOKEN": token,
    Authorization: `Bearer ${token}`,
  };
}

async function fetchRootFile(
  baseUrl: string,
  token: string,
  projectId: string | number,
  path: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  const base = normalizeGitlabBaseUrl(baseUrl);
  const encodedPath = encodeURIComponent(path);
  const project = encodeURIComponent(String(projectId));
  const res = await fetchImpl(
    `${base}/api/v4/projects/${project}/repository/files/${encodedPath}?ref=HEAD`,
    { headers: headers(token) },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as {
    encoding?: string;
    content?: string;
  };
  if (!body.content) return null;
  if (body.encoding === "base64") {
    return Buffer.from(body.content.replace(/\n/g, ""), "base64").toString(
      "utf8",
    );
  }
  return body.content;
}

async function fileExists(
  baseUrl: string,
  token: string,
  projectId: string | number,
  path: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  const text = await fetchRootFile(baseUrl, token, projectId, path, fetchImpl);
  return text != null;
}

async function fetchLanguages(
  baseUrl: string,
  token: string,
  projectId: string | number,
  fetchImpl: FetchLike,
): Promise<LanguageBytes | null> {
  const base = normalizeGitlabBaseUrl(baseUrl);
  const project = encodeURIComponent(String(projectId));
  const res = await fetchImpl(
    `${base}/api/v4/projects/${project}/languages`,
    { headers: headers(token) },
  );
  if (!res.ok) return null;
  return (await res.json()) as LanguageBytes;
}

async function probeCsprojOrSln(
  baseUrl: string,
  token: string,
  projectId: string | number,
  fetchImpl: FetchLike,
): Promise<boolean> {
  const base = normalizeGitlabBaseUrl(baseUrl);
  const project = encodeURIComponent(String(projectId));
  const res = await fetchImpl(
    `${base}/api/v4/projects/${project}/repository/tree?per_page=100&ref=HEAD`,
    { headers: headers(token) },
  );
  if (!res.ok) return false;
  const tree = (await res.json()) as Array<{
    name?: string;
    type?: string;
  }>;
  return tree.some(
    (e) =>
      e.type === "blob" &&
      typeof e.name === "string" &&
      (e.name.endsWith(".csproj") || e.name.endsWith(".sln")),
  );
}

/**
 * Detect project stack for a GitLab project via root files + Languages API.
 */
export async function detectGitlabProjectStack(
  token: string,
  baseUrl: string,
  projectId: string | number,
  fetchImpl: FetchLike = fetch,
): Promise<StackDetectionResult> {
  const packageJson = await fetchRootFile(
    baseUrl,
    token,
    projectId,
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
    fileExists(baseUrl, token, projectId, "go.mod", fetchImpl),
    fileExists(baseUrl, token, projectId, "Cargo.toml", fetchImpl),
    fileExists(baseUrl, token, projectId, "pyproject.toml", fetchImpl),
    fileExists(baseUrl, token, projectId, "requirements.txt", fetchImpl),
    fileExists(baseUrl, token, projectId, "setup.py", fetchImpl),
    fileExists(baseUrl, token, projectId, "Gemfile", fetchImpl),
    fileExists(baseUrl, token, projectId, "pom.xml", fetchImpl),
    fileExists(baseUrl, token, projectId, "build.gradle", fetchImpl),
    fileExists(baseUrl, token, projectId, "composer.json", fetchImpl),
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
    baseUrl,
    token,
    projectId,
    fetchImpl,
  );
  if (files.hasCsprojOrSln) {
    return inferStackFromSignals(files);
  }

  const languages = await fetchLanguages(
    baseUrl,
    token,
    projectId,
    fetchImpl,
  );
  return inferStackFromSignals(files, languages);
}
