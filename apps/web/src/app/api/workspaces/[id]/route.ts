import {
  isAutonomyLevel,
  updateWorkspaceForOwner,
  type AutonomyLevel,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
  serializeWorkspace,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Get a workspace if the caller is a member (IDOR-safe 404 otherwise). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const access = await requireWorkspaceMember(db, id, user.id);
    return jsonOk({ workspace: serializeWorkspace(access) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Update workspace settings — owner only. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    await requireWorkspaceOwner(db, id, user.id);

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      autonomyDefault?: unknown;
    } | null;
    if (!body) {
      throw new ApiError("bad_request", "JSON body required");
    }

    const patch: { name?: string; autonomyDefault?: AutonomyLevel } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        throw new ApiError("bad_request", "name must be a string");
      }
      patch.name = body.name;
    }
    if (body.autonomyDefault !== undefined) {
      if (
        typeof body.autonomyDefault !== "string" ||
        !isAutonomyLevel(body.autonomyDefault)
      ) {
        throw new ApiError("bad_request", "autonomyDefault must be L0, L1, or L2");
      }
      patch.autonomyDefault = body.autonomyDefault;
    }
    if (patch.name === undefined && patch.autonomyDefault === undefined) {
      throw new ApiError("bad_request", "No updatable fields provided");
    }

    const updated = await updateWorkspaceForOwner(db, id, user.id, patch);
    if (!updated) {
      throw new ApiError("not_found", "Workspace not found");
    }
    return jsonOk({ workspace: serializeWorkspace(updated) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
