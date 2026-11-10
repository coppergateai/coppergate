import { retryFailedTask } from "@coppergate/db";
import { BudgetError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
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

function mapBudgetError(err: unknown): never {
  if (err instanceof BudgetError) {
    switch (err.code) {
      case "not_found":
        throw new ApiError("not_found", err.message);
      case "invalid":
      case "mismatch":
        throw new ApiError("bad_request", err.message);
      case "insufficient":
      case "paused":
        throw new ApiError("conflict", err.message);
    }
  }
  throw err;
}

/** FAILED → QUEUED with a new attempt (idempotent key per attempt). */
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

    const result = await retryFailedTask(db, {
      workspaceId: body.workspaceId,
      taskId,
      actor: user.id,
    })
      .catch(mapTaskTransitionError)
      .catch(mapBudgetError);

    logger.info("task retry enqueued", {
      correlationId,
      taskId,
      runId: result.runId,
      attempt: result.attempt,
    });

    return jsonOk(
      {
        task: serializeTask(result.task),
        transition: serializeTransition(result.transition),
        runId: result.runId,
        attempt: result.attempt,
      },
      { correlationId, status: 201 },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
