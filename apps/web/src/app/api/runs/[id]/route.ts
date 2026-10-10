import { getAgentRunForWorkspace } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { serializeRun } from "@/lib/run";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Run status + summary (workspace-scoped). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: runId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const run = await getAgentRunForWorkspace(db, workspaceId, runId);
    if (!run) {
      throw new ApiError("not_found", "Run not found");
    }

    return jsonOk({ run: serializeRun(run) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
