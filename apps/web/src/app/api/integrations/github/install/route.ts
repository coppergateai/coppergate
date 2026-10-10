import { randomBytes } from "node:crypto";
import { githubAppInstallUrl } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import {
  INSTALL_STATE_COOKIE,
  githubAppConfig,
  isSecureCookie,
} from "@/lib/github-install";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Start GitHub App install for a workspace (owner only). */
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
    const config = githubAppConfig();
    const nonce = randomBytes(16).toString("base64url");
    const state = `${body.workspaceId}.${nonce}`;
    const url = githubAppInstallUrl(config, state);

    const res = jsonOk({ url }, { correlationId });
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
