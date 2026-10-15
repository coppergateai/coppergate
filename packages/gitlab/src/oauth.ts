export type GitlabProfile = {
  id: number;
  username: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};

export type GitlabOAuthConfig = {
  /** Origin only, e.g. https://gitlab.com or https://gitlab.trendyol.com */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function normalizeGitlabBaseUrl(raw: string): string {
  return raw.replace(/\/$/, "").replace(/\/api\/v4\/?$/, "");
}

export function gitlabAuthorizeUrl(
  config: GitlabOAuthConfig,
  state: string,
): string {
  const base = normalizeGitlabBaseUrl(config.baseUrl);
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read_user api");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGitlabCode(
  config: GitlabOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const base = normalizeGitlabBaseUrl(config.baseUrl);
  const res = await fetchImpl(`${base}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitLab token exchange failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? "GitLab token missing",
    );
  }
  return data.access_token;
}

export async function fetchGitlabProfile(
  baseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitlabProfile> {
  const base = normalizeGitlabBaseUrl(baseUrl);
  const res = await fetchImpl(`${base}/api/v4/user`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`GitLab profile fetch failed (${res.status})`);
  }
  return (await res.json()) as GitlabProfile;
}

export type GitlabProjectSummary = {
  id: number;
  path_with_namespace: string;
  name: string;
  default_branch: string;
  web_url: string;
  namespace?: { path?: string; kind?: string };
};

export async function listGitlabProjects(
  baseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitlabProjectSummary[]> {
  const base = normalizeGitlabBaseUrl(baseUrl);
  const url = new URL(`${base}/api/v4/projects`);
  url.searchParams.set("membership", "true");
  url.searchParams.set("simple", "true");
  url.searchParams.set("per_page", "50");
  url.searchParams.set("order_by", "last_activity_at");
  const res = await fetchImpl(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`GitLab project list failed (${res.status})`);
  }
  return (await res.json()) as GitlabProjectSummary[];
}
