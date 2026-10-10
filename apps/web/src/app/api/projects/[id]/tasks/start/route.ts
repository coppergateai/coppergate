import { assertCanStartTasks } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { mapBriefError, serializeBrief } from "@/lib/brief";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * FR-02 gate stub: starting tasks requires an approved brief.
 * Real task planning arrives in TASK009.
 */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;

    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const brief = await assertCanStartTasks(
      db,
      body.workspaceId,
      projectId,
    ).catch(mapBriefError);

    return jsonOk(
      {
        ok: true,
        message: "Brief approved — generate a plan via POST /plan/generate",
        brief: serializeBrief(brief),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
