import {
  createWorkspaceWithOwner,
  isAutonomyLevel,
  listWorkspacesForUser,
  type AutonomyLevel,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { serializeWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** List workspaces the caller belongs to. */
export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const rows = await listWorkspacesForUser(db, user.id);
    return jsonOk(
      { workspaces: rows.map(serializeWorkspace) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Create a workspace; caller becomes owner. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      autonomyDefault?: unknown;
    } | null;

    if (!body || typeof body.name !== "string") {
      throw new ApiError("bad_request", "name is required");
    }

    let autonomyDefault: AutonomyLevel | undefined;
    if (body.autonomyDefault !== undefined) {
      if (
        typeof body.autonomyDefault !== "string" ||
        !isAutonomyLevel(body.autonomyDefault)
      ) {
        throw new ApiError("bad_request", "autonomyDefault must be L0, L1, or L2");
      }
      autonomyDefault = body.autonomyDefault;
    }

    const created = await createWorkspaceWithOwner(db, {
      name: body.name,
      ownerUserId: user.id,
      autonomyDefault,
    });

    logger.info("workspace created", {
      correlationId,
      workspaceId: created.workspace.id,
      userId: user.id,
    });

    return jsonOk(
      { workspace: serializeWorkspace(created) },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
