import { startProjectArena } from "@coppergate/db";
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

/** Owner Start — resume arena + continue development without human waits. */
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

    const result = await startProjectArena(db, {
      workspaceId: body.workspaceId,
      projectId,
      actor: user.id,
    }).catch((err: unknown) => {
      throw mapArenaError(err);
    });

    logger.info("arena start", {
      correlationId,
      projectId,
      arenaId: result.arena.id,
      resumedTasks: result.resumedTasks,
    });

    return jsonOk(
      {
        arena: serializeArena(result.arena),
        resumedTasks: result.resumedTasks,
        maintainerEnabled: result.maintainerEnabled,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
