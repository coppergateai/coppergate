import {
  SESSION_COOKIE,
  resolveSessionUser,
  requireSessionUser,
  type GithubOAuthConfig,
} from "@coppergate/auth";
import { ApiError } from "@coppergate/errors";
import type { User } from "@coppergate/db";
import { cookies } from "next/headers";
import { env } from "./env";
import { db } from "./db";

export function githubOAuthConfig(): GithubOAuthConfig {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new ApiError(
      "not_ready",
      "GitHub OAuth is not configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)",
    );
  }
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri: `${env.APP_URL.replace(/\/$/, "")}/api/auth/github/callback`,
  };
}

/** Parse session token from a Cookie header (API routes / tests). */
export function sessionTokenFromHeader(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

export function sessionTokenFromRequest(request: Request): string | undefined {
  return sessionTokenFromHeader(request.headers.get("cookie"));
}

export async function sessionTokenFromCookies(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  try {
    return await resolveSessionUser(db, await sessionTokenFromCookies());
  } catch {
    // Marketing + shell pages call this for CTA state. A transient DB outage
    // must not take down the public homepage — treat as signed-out.
    return null;
  }
}

export async function requireUser(request?: Request): Promise<User> {
  const token = request
    ? sessionTokenFromRequest(request)
    : await sessionTokenFromCookies();
  return requireSessionUser(db, token);
}

export function isSecureCookie(): boolean {
  return env.NODE_ENV === "production" || env.APP_URL.startsWith("https://");
}
