import { approveBrief } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { mapBriefError, serializeBrief } from "@/lib/brief";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { trackFunnel } from "@/lib/funnel";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; briefId: string }> };

/** Approve a draft brief and set projects.current_brief_id. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId, briefId } = await context.params;

    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const brief = await approveBrief(db, {
      workspaceId: body.workspaceId,
      projectId,
      briefId,
      actor: user.id,
    }).catch(mapBriefError);

    logger.info("brief approved", {
      correlationId,
      projectId,
      briefId: brief.id,
      revision: brief.revision,
    });
    trackFunnel({
      stage: "brief_approved",
      workspaceId: body.workspaceId,
      projectId,
      userId: user.id,
      meta: { briefId: brief.id, revision: brief.revision },
    });

    return jsonOk({ brief: serializeBrief(brief) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
