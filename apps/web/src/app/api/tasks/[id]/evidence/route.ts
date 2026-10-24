import { getTaskEvidenceBundle } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Aggregated evidence pack for Delivery Review / Evidence Center. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const runId = url.searchParams.get("runId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const bundle = await getTaskEvidenceBundle(
      db,
      workspaceId,
      taskId,
      runId,
    );
    if (!bundle) {
      throw new ApiError("not_found", "Task not found");
    }

    return jsonOk({ evidence: bundle }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
