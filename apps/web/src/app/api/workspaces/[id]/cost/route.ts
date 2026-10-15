import { getWorkspaceCostExplorer } from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Workspace cost explorer: 7d spend + per-project breakdown. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    const daysRaw = new URL(request.url).searchParams.get("days");
    const days = daysRaw ? Number(daysRaw) : 7;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const cost = await getWorkspaceCostExplorer(db, {
      workspaceId,
      days: Number.isFinite(days) ? days : 7,
    });
    return jsonOk({ cost }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
