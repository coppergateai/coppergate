import { createPrivateKey } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";

export type GithubAppConfig = {
  appId: string;
  privateKeyPem: string;
  slug: string;
};

/** Build GitHub App install URL for selected repositories. */
export function githubAppInstallUrl(
  config: Pick<GithubAppConfig, "slug">,
  state: string,
): string {
  const url = new URL(`https://github.com/apps/${config.slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

/** RS256 JWT for GitHub App authentication (≤10 minutes). */
export async function createAppJwt(config: GithubAppConfig): Promise<string> {
  const key = await importPKCS8(toPkcs8Pem(config.privateKeyPem), "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.appId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .sign(key);
}

/**
 * Normalize env-stored PEM and convert PKCS#1 (`BEGIN RSA PRIVATE KEY`)
 * to PKCS#8 (`BEGIN PRIVATE KEY`) for jose.importPKCS8.
 */
export function toPkcs8Pem(pem: string): string {
  let normalized = pem.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.includes("\\n")) {
    normalized = normalized.replace(/\\n/g, "\n");
  }
  const key = createPrivateKey(normalized);
  return key.export({ type: "pkcs8", format: "pem" }).toString();
}

export type InstallationTokenResult = {
  token: string;
  expiresAt: Date;
};

export async function createInstallationAccessToken(
  appJwt: string,
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstallationTokenResult> {
  const res = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub installation token failed (${res.status})`);
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAt: new Date(data.expires_at) };
}

export type GithubInstallationAccount = {
  id: number;
  account: { login: string; type?: string } | null;
};

export async function fetchInstallation(
  appJwt: string,
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubInstallationAccount> {
  const res = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub installation fetch failed (${res.status})`);
  }
  return (await res.json()) as GithubInstallationAccount;
}

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  owner: { login: string };
};

export async function listInstallationRepos(
  installationToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  let page = 1;
  for (;;) {
    const url = new URL("https://api.github.com/installation/repositories");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const res = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${installationToken}`,
        "User-Agent": "coppergate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub list repos failed (${res.status})`);
    }
    const data = (await res.json()) as {
      repositories: GithubRepo[];
      total_count: number;
    };
    repos.push(...data.repositories);
    if (repos.length >= data.total_count || data.repositories.length === 0) {
      break;
    }
    page += 1;
    if (page > 20) break;
  }
  return repos;
}
