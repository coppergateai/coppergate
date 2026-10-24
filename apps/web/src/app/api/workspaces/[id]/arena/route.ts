import {
  listWorkspaceArenaSnapshot,
  startWorkspaceArena,
  stopWorkspaceArena,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { mapArenaError } from "@/lib/arena";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Workspace arena snapshot — all non-archived project lanes. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const snapshot = await listWorkspaceArenaSnapshot(db, workspaceId);
    return jsonOk(snapshot, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Owner Start/Stop — fan-out across all non-archived projects. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
    } | null;

    if (
      !body ||
      (body.action !== "start" && body.action !== "stop")
    ) {
      throw new ApiError("bad_request", "action must be start or stop");
    }

    const result =
      body.action === "start"
        ? await startWorkspaceArena(db, {
            workspaceId,
            actor: user.id,
          }).catch((err: unknown) => {
            throw mapArenaError(err);
          })
        : await stopWorkspaceArena(db, {
            workspaceId,
            actor: user.id,
          }).catch((err: unknown) => {
            throw mapArenaError(err);
          });

    logger.info(`workspace arena ${body.action}`, {
      correlationId,
      workspaceId,
      started: result.started,
      stopped: result.stopped,
      errorCount: result.errors.length,
      status: result.status,
    });

    return jsonOk(result, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
