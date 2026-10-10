import { loadEnv } from "@coppergate/config";
import {
  getInstallationForWorkspace,
  getProjectForWorkspace,
  updateInstallationToken,
  type Database,
  type GithubInstallation,
} from "@coppergate/db";
import {
  FakeGithubDelivery,
  HttpGithubDelivery,
  createAppJwt,
  createInstallationAccessToken,
  openSecret,
  parseEncryptionKey,
  sealSecret,
  type GithubDeliveryClient,
  type RepoRef,
} from "@coppergate/github";

export type DeliveryMode = "fake" | "http";

export function resolveDeliveryMode(
  env: { GITHUB_DELIVERY_MODE?: string } = loadEnv(),
): DeliveryMode {
  const raw = (env.GITHUB_DELIVERY_MODE ?? "fake").toLowerCase();
  return raw === "http" ? "http" : "fake";
}

async function resolveInstallationToken(
  db: Database,
  installation: GithubInstallation,
): Promise<string> {
  const env = loadEnv();
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_SLUG ||
    !env.GITHUB_APP_PRIVATE_KEY
  ) {
    throw new Error(
      "GitHub App is not configured (GITHUB_APP_ID / SLUG / PRIVATE_KEY)",
    );
  }
  const key = parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
  const skewMs = 60_000;
  if (
    installation.encryptedToken &&
    installation.tokenExpiresAt &&
    installation.tokenExpiresAt.getTime() > Date.now() + skewMs
  ) {
    return openSecret(installation.encryptedToken, key);
  }

  const jwt = await createAppJwt({
    appId: env.GITHUB_APP_ID,
    slug: env.GITHUB_APP_SLUG,
    privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
  });
  const minted = await createInstallationAccessToken(
    jwt,
    installation.githubInstallationId,
  );
  const sealed = sealSecret(minted.token, key);
  await updateInstallationToken(db, installation.id, sealed, minted.expiresAt);
  return minted.token;
}

export async function fetchDefaultBranchHeadSha(
  token: string,
  repo: RepoRef,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(repo.defaultBranch)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "coppergate-worker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to resolve base SHA for ${repo.owner}/${repo.repo}@${repo.defaultBranch} (${res.status})`,
    );
  }
  const body = (await res.json()) as { object?: { sha?: string } };
  const sha = body.object?.sha;
  if (!sha) throw new Error("GitHub ref response missing object.sha");
  return sha;
}

/**
 * Build delivery client + repo context for a project.
 * Default remains FakeGithubDelivery (CI / local without App).
 */
export async function resolveGithubDelivery(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    baseSha: string;
    mode?: DeliveryMode;
  },
): Promise<{
  client: GithubDeliveryClient;
  repo: RepoRef;
  baseSha: string;
  mode: DeliveryMode;
}> {
  const mode = input.mode ?? resolveDeliveryMode();
  if (mode === "fake") {
    return {
      client: new FakeGithubDelivery(),
      repo: { owner: "example", repo: "repo", defaultBranch: "main" },
      baseSha: input.baseSha === "unknown" ? "0".repeat(40) : input.baseSha,
      mode,
    };
  }

  const project = await getProjectForWorkspace(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!project) {
    throw new Error("Project not found for GitHub delivery");
  }
  const repo: RepoRef = {
    owner: project.repository.owner,
    repo: project.repository.name,
    defaultBranch: project.repository.defaultBranch,
  };

  const installation = await getInstallationForWorkspace(
    db,
    input.workspaceId,
  );
  if (!installation || installation.status !== "active") {
    throw new Error("Active GitHub App installation required for http delivery");
  }

  const token = await resolveInstallationToken(db, installation);
  let baseSha = input.baseSha;
  if (!baseSha || baseSha === "unknown") {
    baseSha = await fetchDefaultBranchHeadSha(token, repo);
  }

  return {
    client: new HttpGithubDelivery(token),
    repo,
    baseSha,
    mode,
  };
}
