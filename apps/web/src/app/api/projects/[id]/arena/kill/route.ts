import { getArenaForProject, killArena } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { mapArenaError, serializeArena } from "@/lib/arena";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Owner kill-switch — cancel open ContenderRuns and freeze enqueue. */
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

    const arena = await getArenaForProject(db, {
      workspaceId: body.workspaceId,
      projectId,
    });
    if (!arena) {
      throw new ApiError("not_found", "Arena not found for project");
    }

    const killed = await killArena(db, {
      workspaceId: body.workspaceId,
      arenaId: arena.id,
      actor: user.id,
    }).catch(mapArenaError);

    logger.info("arena kill", {
      correlationId,
      projectId,
      arenaId: killed.id,
    });

    return jsonOk({ arena: serializeArena(killed) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
