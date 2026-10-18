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
import {
  FakeGitlabDelivery,
  HttpGitlabDelivery,
} from "@coppergate/gitlab";
import {
  createScmDeliveryClient,
  type ScmDeliveryClient,
  type ScmProviderId,
} from "@coppergate/scm";

export type DeliveryMode = "fake" | "http";

export function resolveDeliveryMode(
  env: {
    GITHUB_DELIVERY_MODE?: string;
    SCM_DELIVERY_MODE?: string;
  } = loadEnv(),
): DeliveryMode {
  const unified = (env.SCM_DELIVERY_MODE ?? "").toLowerCase();
  if (unified === "http" || unified === "fake") {
    return unified;
  }
  const raw = (env.GITHUB_DELIVERY_MODE ?? "fake").toLowerCase();
  return raw === "http" ? "http" : "fake";
}

/** Exported for maintainer auto-merge scheduler. */
export async function resolveWorkerInstallationToken(
  db: Database,
  installation: GithubInstallation,
): Promise<string> {
  return resolveInstallationToken(db, installation);
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

function resolveGitlabToken(installation: GithubInstallation): string {
  const env = loadEnv();
  if (!installation.encryptedToken) {
    throw new Error("GitLab installation is missing a sealed access token");
  }
  const key = parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
  return openSecret(installation.encryptedToken, key);
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
 * Routes to GitHub PR or GitLab MR based on installation.provider (D12).
 */
export type ResolvedGithubDelivery = {
  client: GithubDeliveryClient | ScmDeliveryClient;
  repo: RepoRef;
  baseSha: string;
  mode: DeliveryMode;
  provider: "github" | "gitlab";
  /** HTTPS clone URL (no credentials). */
  cloneUrl: string | null;
  /** Installation / PAT for git clone — never log. */
  authToken: string | null;
};

export async function resolveGithubDelivery(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    baseSha: string;
    mode?: DeliveryMode;
  },
): Promise<ResolvedGithubDelivery> {
  const mode = input.mode ?? resolveDeliveryMode();
  if (mode === "fake") {
    return {
      client: new FakeGithubDelivery(),
      repo: { owner: "example", repo: "repo", defaultBranch: "main" },
      baseSha: input.baseSha === "unknown" ? "0".repeat(40) : input.baseSha,
      mode,
      provider: "github",
      cloneUrl: null,
      authToken: null,
    };
  }

  const project = await getProjectForWorkspace(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (!project) {
    throw new Error("Project not found for SCM delivery");
  }
  // TASK121: writes always target the primary binding — never a secondary that
  // happens to sort first in an unfiltered projectId join (dogfood regression).
  if (project.repository.repoRole !== "primary") {
    throw new Error(
      `SCM delivery refused non-primary repo ${project.repository.baseRepoFullName} (role=${project.repository.repoRole})`,
    );
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
    throw new Error("Active SCM installation required for http delivery");
  }

  const provider =
    installation.provider === "gitlab" ? "gitlab" : "github";

  if (provider === "gitlab") {
    const env = loadEnv();
    const token = resolveGitlabToken(installation);
    const projectId =
      project.repository.githubRepoId || installation.githubInstallationId;
    const baseUrl = (env.GITLAB_BASE_URL ?? "https://gitlab.com").replace(
      /\/$/,
      "",
    );
    return {
      client: new HttpGitlabDelivery(token, env.GITLAB_BASE_URL, projectId),
      repo: {
        ...repo,
        // HttpGitlabDelivery reads owner/repo; full path used in fake URLs only
      },
      baseSha:
        !input.baseSha || input.baseSha === "unknown"
          ? "0".repeat(40)
          : input.baseSha,
      mode,
      provider,
      cloneUrl: `${baseUrl}/${repo.owner}/${repo.repo}.git`,
      authToken: token,
    };
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
    provider,
    cloneUrl: `https://github.com/${repo.owner}/${repo.repo}.git`,
    authToken: token,
  };
}

/** Prefer provider-native fake when mode is fake (TASK117/118). */
export function fakeClientForProvider(
  provider: ScmProviderId,
): ScmDeliveryClient {
  if (provider === "gitlab") return new FakeGitlabDelivery();
  if (provider === "bitbucket") {
    return createScmDeliveryClient({ provider: "bitbucket", mode: "fake" });
  }
  if (provider === "azure_devops") {
    return createScmDeliveryClient({
      provider: "azure_devops",
      mode: "fake",
    });
  }
  return new FakeGithubDelivery();
}
