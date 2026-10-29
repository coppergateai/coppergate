import {
  createShipReceiptShareToken,
  ShareError,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** P-106 — create public-safe Ship Receipt share token. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      projectId?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    if (typeof body.projectId !== "string") {
      throw new ApiError("bad_request", "projectId required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const share = await createShipReceiptShareToken(db, {
      workspaceId: body.workspaceId,
      projectId: body.projectId,
      taskId,
      actor: user.id,
    });
    return jsonOk(
      {
        share: {
          id: share.id,
          token: share.token,
          url: `/share/receipt/${share.token}`,
          taskId: share.taskId,
          createdAt: share.createdAt.toISOString(),
        },
      },
      { correlationId },
    );
  } catch (err) {
    if (err instanceof ShareError) {
      return jsonError(new ApiError("bad_request", err.message), correlationId);
    }
    return jsonError(err, correlationId);
  }
}
