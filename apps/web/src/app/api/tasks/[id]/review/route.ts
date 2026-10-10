import { decideTaskReview, type ReviewDecision } from "@coppergate/db";
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

const DECISIONS = new Set<ReviewDecision>([
  "accept",
  "reject",
  "request_changes",
]);

/** Human review: accept → DONE, reject → FAILED, request_changes → NEEDS_REPLAN. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      decision?: unknown;
      note?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.decision !== "string" || !DECISIONS.has(body.decision as ReviewDecision)) {
      throw new ApiError(
        "bad_request",
        "decision must be accept | reject | request_changes",
      );
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const result = await decideTaskReview(db, {
      workspaceId: body.workspaceId,
      taskId,
      actor: user.id,
      decision: body.decision as ReviewDecision,
      note: typeof body.note === "string" ? body.note : undefined,
    }).catch(mapTaskTransitionError);

    logger.info("task review decision", {
      correlationId,
      taskId,
      decision: body.decision,
      status: result.task.status,
    });
    if (body.decision === "accept") {
      trackFunnel({
        stage: "pr_accepted",
        workspaceId: body.workspaceId,
        projectId: result.task.projectId,
        taskId,
        userId: user.id,
        meta: { status: result.task.status },
      });
    }

    return jsonOk(
      {
        task: serializeTask(result.task),
        transition: serializeTransition(result.transition),
        decision: body.decision,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
