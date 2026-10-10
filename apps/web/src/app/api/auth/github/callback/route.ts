import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  exchangeGithubCode,
  fetchGithubProfile,
  establishSession,
  sessionCookieOptions,
} from "@coppergate/auth";
import { upsertGithubUser } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { githubOAuthConfig, isSecureCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Complete GitHub OAuth — upsert user, mint session cookie, redirect home. */
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
    const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
    if (!expected || expected !== state) {
      throw new ApiError("forbidden", "Invalid OAuth state");
    }

    const config = githubOAuthConfig();
    const accessToken = await exchangeGithubCode(config, code);
    const profile = await fetchGithubProfile(accessToken);

    const user = await upsertGithubUser(db, {
      githubUserId: String(profile.id),
      login: profile.login,
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

    logger.info("login success", {
      correlationId,
      userId: user.id,
      login: user.login,
    });
    return res;
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
