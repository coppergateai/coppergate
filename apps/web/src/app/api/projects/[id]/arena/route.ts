import {
  ensureArenaForProject,
  getArenaForProject,
  listContendersForArena,
  MAX_TOURNAMENT_FANOUT,
  setArenaMinHuman,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import {
  mapArenaError,
  serializeArena,
  serializeContender,
} from "@/lib/arena";
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

/** GET arena + contender pool for a project. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const arena = await getArenaForProject(db, { workspaceId, projectId });
    if (!arena) {
      return jsonOk({ arena: null, contenders: [] }, { correlationId });
    }

    const pool = await listContendersForArena(db, {
      workspaceId,
      arenaId: arena.id,
    });

    return jsonOk(
      {
        arena: serializeArena(arena),
        contenders: pool.map(serializeContender),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** POST arm / ensure arena for project (owner). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      minHuman?: unknown;
      defaultContenderN?: unknown;
      contenderBudgetMicros?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const n =
      typeof body.defaultContenderN === "number"
        ? body.defaultContenderN
        : MAX_TOURNAMENT_FANOUT;
    const budget =
      typeof body.contenderBudgetMicros === "number"
        ? body.contenderBudgetMicros
        : 0;

    const result = await ensureArenaForProject(db, {
      workspaceId: body.workspaceId,
      projectId,
      actor: user.id,
      minHuman: body.minHuman === true,
      defaultContenderN: n,
      contenderCount: n,
      contenderBudgetMicros: budget,
    }).catch(mapArenaError);

    logger.info("arena ensure", {
      correlationId,
      projectId,
      arenaId: result.arena.id,
      created: result.created,
    });

    return jsonOk(
      {
        arena: serializeArena(result.arena),
        contenders: result.contenders.map(serializeContender),
        created: result.created,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** PATCH arena policy (min_human). Default remains false until G1b. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      minHuman?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.minHuman !== "boolean") {
      throw new ApiError("bad_request", "minHuman must be a boolean");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const arena = await getArenaForProject(db, {
      workspaceId: body.workspaceId,
      projectId,
    });
    if (!arena) {
      throw new ApiError("not_found", "Arena not found for project");
    }

    const updated = await setArenaMinHuman(db, {
      workspaceId: body.workspaceId,
      arenaId: arena.id,
      minHuman: body.minHuman,
      actor: user.id,
    }).catch(mapArenaError);

    logger.info("arena min_human", {
      correlationId,
      projectId,
      minHuman: updated.minHuman,
    });

    return jsonOk({ arena: serializeArena(updated) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
