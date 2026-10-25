import { getShipReceiptForTask } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Ship Receipt for an accepted Open Program delivery. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, workspaceId, user.id);
    const hit = await getShipReceiptForTask(db, workspaceId, taskId);
    if (!hit) {
      throw new ApiError("not_found", "Ship Receipt not found for this task");
    }

    return jsonOk(
      {
        artifactId: hit.artifact.id,
        createdAt: hit.artifact.createdAt.toISOString(),
        receipt: hit.receipt,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
