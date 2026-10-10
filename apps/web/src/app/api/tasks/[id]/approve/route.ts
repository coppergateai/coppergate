import { approveTask } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { trackFunnel } from "@/lib/funnel";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import {
  mapTaskTransitionError,
  serializeTask,
  serializeTransition,
} from "@/lib/task";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** READY_FOR_APPROVAL → QUEUED (policy-gated). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const result = await approveTask(db, {
      workspaceId: body.workspaceId,
      taskId,
      actor: user.id,
    }).catch(mapTaskTransitionError);

    logger.info("task approved", {
      correlationId,
      taskId,
      status: result.task.status,
    });
    trackFunnel({
      stage: "task_started",
      workspaceId: body.workspaceId,
      projectId: result.task.projectId,
      taskId,
      userId: user.id,
      meta: { status: result.task.status },
    });

    return jsonOk(
      {
        task: serializeTask(result.task),
        transition: serializeTransition(result.transition),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
