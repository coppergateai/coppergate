import { getProjectPlan } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { serializePlan } from "@/lib/plan";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Get current non-cancelled plan for a project. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId query is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);
    const plan = await getProjectPlan(db, workspaceId, projectId);
    return jsonOk(
      { plan: plan ? serializePlan(plan) : null },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
