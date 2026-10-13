import {
  createDeliveryShareToken,
  getAgentRunForWorkspace,
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

/** TASK044 — create shareable redacted delivery report token. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: runId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const run = await getAgentRunForWorkspace(db, body.workspaceId, runId);
    if (!run) throw new ApiError("not_found", "run not found");
    const share = await createDeliveryShareToken(db, {
      workspaceId: body.workspaceId,
      projectId: run.projectId,
      taskId: run.taskId,
      runId: run.id,
      actor: user.id,
    });
    return jsonOk(
      {
        share: {
          id: share.id,
          token: share.token,
          url: `/share/r/${share.token}`,
          runId: share.runId,
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
