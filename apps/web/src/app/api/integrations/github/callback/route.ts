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
} from "@/lib/github-install";
import { trackFunnel } from "@/lib/funnel";
import { correlationIdFrom, jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GitHub App setup callback — persists installation + sealed token.
 * Configure the App's "Setup URL" to this route.
 */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const installationId = url.searchParams.get("installation_id");
    const setupAction = url.searchParams.get("setup_action");
    const state = url.searchParams.get("state");

    if (!installationId || !state) {
      throw new ApiError("bad_request", "Missing installation_id or state");
    }

    const jar = await cookies();
    const expected = jar.get(INSTALL_STATE_COOKIE)?.value;
    if (!expected || expected !== state) {
      throw new ApiError("forbidden", "Invalid install state");
    }

    const [workspaceId] = state.split(".");
    if (!workspaceId) {
      throw new ApiError("bad_request", "Malformed install state");
    }

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
