import {
  SESSION_COOKIE,
  assertCsrf,
  destroySession,
  sessionCookieOptions,
} from "@coppergate/auth";
import { ApiError } from "@coppergate/errors";
import { isSecureCookie, sessionTokenFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** CSRF-safe logout — clears server session + cookie. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    try {
      assertCsrf(request, env.APP_URL);
    } catch {
      throw new ApiError("forbidden", "CSRF check failed");
    }

    const token = sessionTokenFromRequest(request);
    await destroySession(db, token);

    const res = jsonOk({ ok: true }, { correlationId });
    const opts = sessionCookieOptions(isSecureCookie());
    res.cookies.set({
      name: SESSION_COOKIE,
      value: "",
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: 0,
    });
    logger.info("logout", { correlationId });
    return res;
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Reject GET logout to avoid CSRF via image/link. */
export async function GET(request: Request) {
  return jsonError(
    new ApiError("bad_request", "Use POST /api/auth/logout"),
    correlationIdFrom(request),
  );
}
