import {
  createAppJwt,
  createInstallationAccessToken,
  fetchInstallation,
  sealSecret,
} from "@coppergate/github";
import { upsertGithubInstallation } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  INSTALL_STATE_COOKIE,
  credentialsKey,
  githubAppConfig,
  isSecureCookie,
  verifyInstallState,
} from "@/lib/github-install";
import {
  appOrigin,
  canonicalInstallCallbackRedirect,
  hostedFallbackInstallRedirect,
  installStateErrorMessage,
} from "@/lib/github-install-callback";
import { trackFunnel } from "@/lib/funnel";
import { correlationIdFrom, jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GitHub App setup callback — persists installation + sealed token.
 * Configure the App's "Setup URL" to `{APP_URL}/api/integrations/github/callback`
 * (production: https://www.coppergate.ai/api/integrations/github/callback).
 */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    // If Setup URL still points at a non-canonical public host while this
    // deployment's APP_URL is www, bounce first (apex → www).
    const bounce = canonicalInstallCallbackRedirect(request.url, env.APP_URL);
    if (bounce) {
      logger.info("github install callback host rewrite", {
        correlationId,
        from: new URL(request.url).origin,
        to: appOrigin(env.APP_URL),
      });
      return NextResponse.redirect(bounce, 307);
    }

    const url = new URL(request.url);
    const installationId = url.searchParams.get("installation_id");
    const setupAction = url.searchParams.get("setup_action");
    const state = url.searchParams.get("state");

    if (!installationId || !state) {
      throw new ApiError("bad_request", "Missing installation_id or state");
    }

    // HMAC-signed state is authoritative (cookie often missing after GitHub → app).
    // Resolve workspace before requireUser so a localhost Setup URL can 307 to
    // hosted without needing a local session cookie.
    const jar = await cookies();
    const cookieState =
      jar.get(INSTALL_STATE_COOKIE)?.value ??
      cookieValue(request.headers.get("cookie"), INSTALL_STATE_COOKIE);
    const workspaceId =
      (cookieState && cookieState === state ? state.split(".")[0] : null) ??
      verifyInstallState(state, env.SESSION_SECRET);

    if (!workspaceId) {
      const hosted = hostedFallbackInstallRedirect(request.url, env.APP_URL);
      if (hosted) {
        logger.info("github install callback hosted fallback", {
          correlationId,
          from: new URL(request.url).origin,
        });
        return NextResponse.redirect(hosted, 307);
      }
      throw new ApiError("forbidden", installStateErrorMessage(env.APP_URL));
    }

    const user = await requireUser(request);
    await requireWorkspaceOwner(db, workspaceId, user.id);

    if (setupAction === "request") {
      // Org install pending approval — still record nothing sensitive.
      const redirect = NextResponse.redirect(
        `${env.APP_URL.replace(/\/$/, "")}/workspaces/${workspaceId}/settings?github=pending`,
      );
      clearStateCookie(redirect);
      return redirect;
    }

    const config = githubAppConfig();
    const jwt = await createAppJwt(config);
    const meta = await fetchInstallation(jwt, installationId);
    const token = await createInstallationAccessToken(jwt, installationId);
    const sealed = sealSecret(token.token, credentialsKey());

    await upsertGithubInstallation(db, {
      workspaceId,
      githubInstallationId: installationId,
      accountLogin: meta.account?.login ?? "unknown",
      accountType: meta.account?.type ?? null,
      encryptedToken: sealed,
      tokenExpiresAt: token.expiresAt,
      status: "active",
    });

    logger.info("github app installed", {
      correlationId,
      workspaceId,
      installationId,
      userId: user.id,
    });
    trackFunnel({
      stage: "github_connected",
      workspaceId,
      userId: user.id,
      meta: { installationId },
    });

    const redirect = NextResponse.redirect(
      `${env.APP_URL.replace(/\/$/, "")}/workspaces/${workspaceId}/settings?github=connected`,
    );
    clearStateCookie(redirect);
    return redirect;
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

function clearStateCookie(res: NextResponse): void {
  res.cookies.set({
    name: INSTALL_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function cookieValue(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}
