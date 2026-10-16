import { githubAppInstallUrl } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  INSTALL_STATE_COOKIE,
  createInstallState,
  githubAppConfig,
  isSecureCookie,
} from "@/lib/github-install";
import { correlationIdFrom, jsonError } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

async function readWorkspaceId(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    return body.workspaceId;
  }

  const form = await request.formData().catch(() => null);
  const workspaceId = form?.get("workspaceId");
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new ApiError("bad_request", "workspaceId is required");
  }
  return workspaceId;
}

/**
 * Start GitHub App install for a workspace (owner only).
 * Always 302 → GitHub with Set-Cookie on the navigation response so the
 * state cookie survives the round-trip (fetch+JSON then location.href often
 * drops it before returning from github.com).
 */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const workspaceId = await readWorkspaceId(request);

    await requireWorkspaceOwner(db, workspaceId, user.id);
    const config = githubAppConfig();
    const state = createInstallState(workspaceId, env.SESSION_SECRET);
    const url = githubAppInstallUrl(config, state);

    const res = NextResponse.redirect(url, 303);
    res.headers.set("x-correlation-id", correlationId);
    res.cookies.set({
      name: INSTALL_STATE_COOKIE,
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
