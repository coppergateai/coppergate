import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  establishSession,
  sessionCookieOptions,
} from "@coppergate/auth";
import { upsertScmInstallation, upsertScmUser } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import {
  exchangeGitlabCode,
  fetchGitlabProfile,
} from "@coppergate/gitlab";
import { parseEncryptionKey, sealSecret } from "@coppergate/github";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSecureCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  GITLAB_INSTALL_STATE_COOKIE,
  gitlabOAuthConfig,
} from "@/lib/gitlab";
import { correlationIdFrom, jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Complete GitLab OAuth.
 * - Login: OAUTH_STATE_COOKIE matches → upsert user + session
 * - Install: GITLAB_INSTALL_STATE_COOKIE matches → seal token on workspace
 */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      throw new ApiError(
        "bad_request",
        url.searchParams.get("error_description") ?? oauthError,
      );
    }
    if (!code || !state) {
      throw new ApiError("bad_request", "Missing OAuth code or state");
    }

    const jar = await cookies();
    const installExpected = jar.get(GITLAB_INSTALL_STATE_COOKIE)?.value;
    const loginExpected = jar.get(OAUTH_STATE_COOKIE)?.value;

    const config = gitlabOAuthConfig();
    const accessToken = await exchangeGitlabCode(config, code);
    const profile = await fetchGitlabProfile(config.baseUrl, accessToken);

    if (installExpected && installExpected === state) {
      const workspaceId = state.split(".")[0];
      if (!workspaceId) {
        throw new ApiError("bad_request", "Malformed install state");
      }

      const key = parseEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
      const sealed = sealSecret(accessToken, key);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await upsertScmInstallation(db, {
        workspaceId,
        provider: "gitlab",
        githubInstallationId: `gitlab-user:${profile.id}`,
        accountLogin: profile.username,
        accountType: "User",
        encryptedToken: sealed,
        tokenExpiresAt: expiresAt,
        status: "active",
      });

      const redirectTo = `${env.APP_URL.replace(/\/$/, "")}/workspaces/${workspaceId}/settings?gitlab=connected`;
      const res = NextResponse.redirect(redirectTo);
      res.cookies.set({
        name: GITLAB_INSTALL_STATE_COOKIE,
        value: "",
        httpOnly: true,
        secure: isSecureCookie(),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      logger.info("gitlab install connected", {
        correlationId,
        workspaceId,
        login: profile.username,
      });
      return res;
    }

    if (!loginExpected || loginExpected !== state) {
      throw new ApiError("forbidden", "Invalid OAuth state");
    }

    const user = await upsertScmUser(db, {
      authProvider: "gitlab",
      externalUserId: String(profile.id),
      login: profile.username,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatar_url,
    });

    const token = await establishSession(db, user.id);
    const home = env.APP_URL.replace(/\/$/, "") + "/";
    const res = NextResponse.redirect(home);
    const sessionOpts = sessionCookieOptions(isSecureCookie());
    res.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: sessionOpts.httpOnly,
      secure: sessionOpts.secure,
      sameSite: sessionOpts.sameSite,
      path: sessionOpts.path,
      maxAge: sessionOpts.maxAge,
    });
    res.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: "",
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    logger.info("gitlab login success", {
      correlationId,
      userId: user.id,
      login: user.login,
    });
    return res;
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
