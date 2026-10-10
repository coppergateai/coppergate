import { appendRunEvent, requestCancelRun } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { mapRunError, serializeRun } from "@/lib/run";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Cooperative cancel — sets cancel_requested_at; QUEUED → CANCELLED. */
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
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const run = await requestCancelRun(db, {
      workspaceId: body.workspaceId,
      runId,
      actor: user.id,
    }).catch(mapRunError);

    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "status",
      payload: {
        message: "Cancel requested",
        status: run.status,
        actor: user.id,
      },
    });

    logger.info("run cancel requested", {
      correlationId,
      runId: run.id,
      status: run.status,
    });

    return jsonOk({ run: serializeRun(run) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
