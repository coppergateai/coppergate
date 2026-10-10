import { getProjectSpendSummary } from "@coppergate/db";
import { BudgetError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Spend summary for a project (FR-07 foundation). */
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

    const summary = await getProjectSpendSummary(
      db,
      workspaceId,
      projectId,
    ).catch((err: unknown) => {
      if (err instanceof BudgetError && err.code === "not_found") {
        throw new ApiError("not_found", err.message);
      }
      throw err;
    });

    return jsonOk({ usage: summary }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
