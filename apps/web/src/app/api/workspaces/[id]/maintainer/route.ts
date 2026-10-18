import { getWorkspaceMaintainerRollup } from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Multi-project maintainer KPI rollup. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? "30");
    const rollup = await getWorkspaceMaintainerRollup(db, {
      workspaceId,
      days: Number.isFinite(days) ? days : 30,
    });
    return jsonOk(rollup, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
