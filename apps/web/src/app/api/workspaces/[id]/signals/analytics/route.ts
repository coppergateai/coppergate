import { getSpendBySignalSource } from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** TASK109 — spend by signal source. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const daysParam = new URL(request.url).searchParams.get("days");
    const days = daysParam ? Number(daysParam) : 30;
    const analytics = await getSpendBySignalSource(db, {
      workspaceId,
      days: Number.isFinite(days) ? days : 30,
    });
    return jsonOk({ analytics }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
