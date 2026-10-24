import {
  OAUTH_STATE_COOKIE,
  githubAuthorizeUrl,
  oauthStateCookieOptions,
} from "@coppergate/auth";
import { ApiError } from "@coppergate/errors";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { githubOAuthConfig, isSecureCookie } from "@/lib/auth";
import { correlationIdFrom, jsonError } from "@/lib/http";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Start GitHub OAuth — sets state cookie and redirects to GitHub. */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const ip = clientIpFromRequest(request);
    const limited = checkRateLimit(`auth-github:${ip}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      throw new ApiError("bad_request", "Too many requests", { status: 429 });
    }
    const config = githubOAuthConfig();
    const state = randomBytes(24).toString("base64url");
    const url = githubAuthorizeUrl(config, state);
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
