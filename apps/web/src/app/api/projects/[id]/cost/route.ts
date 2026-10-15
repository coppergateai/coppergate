import { getProjectCostExplorer } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Project cost explorer strip (7d spend + top tasks). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId query is required");
    }
    const daysRaw = url.searchParams.get("days");
    const days = daysRaw ? Number(daysRaw) : 7;
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      throw new ApiError("bad_request", "days must be 1–90");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);
    const cost = await getProjectCostExplorer(db, {
      workspaceId,
      projectId,
      days,
    });
    return jsonOk({ cost }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
