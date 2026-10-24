import { gitlabAuthorizeUrl } from "@coppergate/gitlab";
import { ApiError } from "@coppergate/errors";
import { requireUser, isSecureCookie } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  GITLAB_INSTALL_STATE_COOKIE,
  gitlabInstallOAuthConfig,
} from "@/lib/gitlab";
import { createSignedWorkspaceState } from "@/lib/signed-workspace-state";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Start GitLab OAuth install for a workspace (owner only).
 * Callback seals the access token as the workspace SCM installation.
 */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const config = gitlabInstallOAuthConfig();
    const state = createSignedWorkspaceState(
      body.workspaceId,
      env.SESSION_SECRET,
    );
    const url = gitlabAuthorizeUrl(config, state);

    const res = jsonOk({ url }, { correlationId });
    res.cookies.set({
      name: GITLAB_INSTALL_STATE_COOKIE,
      value: state,
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return res;
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
