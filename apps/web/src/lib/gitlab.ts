import { ApiError } from "@coppergate/errors";
import type { GitlabOAuthConfig } from "@coppergate/gitlab";
import { env } from "./env";

export const GITLAB_INSTALL_STATE_COOKIE = "cg_gitlab_install_state";

export function gitlabOAuthConfig(): GitlabOAuthConfig {
  if (!env.GITLAB_CLIENT_ID || !env.GITLAB_CLIENT_SECRET) {
    throw new ApiError(
      "not_ready",
      "GitLab OAuth is not configured (GITLAB_CLIENT_ID / GITLAB_CLIENT_SECRET)",
    );
  }
  return {
    baseUrl: env.GITLAB_BASE_URL,
    clientId: env.GITLAB_CLIENT_ID,
    clientSecret: env.GITLAB_CLIENT_SECRET,
    redirectUri: `${env.APP_URL.replace(/\/$/, "")}/api/auth/gitlab/callback`,
  };
}

/** Same OAuth app redirect as login — purpose distinguished by install cookie. */
export function gitlabInstallOAuthConfig(): GitlabOAuthConfig {
  return gitlabOAuthConfig();
}

export function isGitlabConfigured(): boolean {
  return Boolean(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET);
}
