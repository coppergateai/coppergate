import { OAUTH_STATE_COOKIE, oauthStateCookieOptions } from "@coppergate/auth";
import { gitlabAuthorizeUrl } from "@coppergate/gitlab";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isSecureCookie } from "@/lib/auth";
import { gitlabOAuthConfig } from "@/lib/gitlab";
import { correlationIdFrom, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Start GitLab OAuth login — sets state cookie and redirects to GitLab. */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const config = gitlabOAuthConfig();
    const state = randomBytes(24).toString("base64url");
    const url = gitlabAuthorizeUrl(config, state);
    const res = NextResponse.redirect(url);
    const opts = oauthStateCookieOptions(isSecureCookie());
    res.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge,
    });
    return res;
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
