export type GithubProfile = {
  id: number;
  login: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};

export type GithubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function githubAuthorizeUrl(
  config: GithubOAuthConfig,
  state: string,
): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(
  config: GithubOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? "GitHub token missing",
    );
  }
  return data.access_token;
}

export async function fetchGithubProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProfile> {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "coppergate",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub profile fetch failed (${res.status})`);
  }
  const profile = (await res.json()) as GithubProfile;

  if (!profile.email) {
    const emailRes = await fetchImpl("https://api.github.com/user/emails", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "coppergate",
      },
    });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary =
        emails.find((e) => e.primary && e.verified) ??
        emails.find((e) => e.verified);
      if (primary) profile.email = primary.email;
    }
  }

  return profile;
}
