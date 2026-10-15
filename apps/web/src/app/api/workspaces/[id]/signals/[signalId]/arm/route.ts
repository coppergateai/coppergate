import { SignalError, armSignalEvent, dismissSignalEvent } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; signalId: string }>;
};

/** Manual arm from signal inbox (TASK065). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId, signalId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      profileKeys?: string[];
    };
    const result = await armSignalEvent(db, {
      workspaceId,
      signalId,
      actor: `user:${user.id}`,
      projectId: body.projectId ?? null,
      profileKeys: body.profileKeys,
      armArena: true,
    });
    return jsonOk(
      { event: result.event, taskId: result.task.id },
      { correlationId },
    );
  } catch (err) {
    if (err instanceof SignalError) {
      return jsonError(
        new ApiError(
          err.code === "not_found" ? "not_found" : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}

/** Dismiss / ignore signal. */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId, signalId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const event = await dismissSignalEvent(db, {
      workspaceId,
      signalId,
      actor: `user:${user.id}`,
    });
    return jsonOk({ event }, { correlationId });
  } catch (err) {
    if (err instanceof SignalError) {
      return jsonError(
        new ApiError(
          err.code === "not_found" ? "not_found" : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}
