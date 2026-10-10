import { listRunEventsForWorkspace } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { mapRunError, serializeRunEvent } from "@/lib/run";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Activity stream for a run (cursor via afterSeq). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: runId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    const afterRaw = url.searchParams.get("afterSeq");
    let afterSeq: number | undefined;
    if (afterRaw != null && afterRaw !== "") {
      afterSeq = Number(afterRaw);
      if (!Number.isFinite(afterSeq) || afterSeq < 0) {
        throw new ApiError("bad_request", "afterSeq must be a non-negative number");
      }
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const events = await listRunEventsForWorkspace(
      db,
      workspaceId,
      runId,
      afterSeq != null ? { afterSeq } : undefined,
    ).catch(mapRunError);

    return jsonOk(
      {
        events: events.map(serializeRunEvent),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
