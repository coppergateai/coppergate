import { getTaskForWorkspace } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { serializeTask } from "@/lib/task";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const task = await getTaskForWorkspace(db, workspaceId, taskId);
    if (!task) {
      throw new ApiError("not_found", "Task not found");
    }

    return jsonOk(
      {
        task: {
          ...serializeTask(task),
          attemptCount: task.attemptCount,
          maxAttempts: task.maxAttempts,
          prUrl: task.prUrl,
          baseSha: task.baseSha,
        },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
