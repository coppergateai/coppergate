import {
  DeletionError,
  isAutonomyLevel,
  softDeleteWorkspace,
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
      notifyWebhookUrl?: unknown;
      notifyEmailEnabled?: unknown;
    } | null;
    if (!body) {
      throw new ApiError("bad_request", "JSON body required");
    }

    const patch: {
      name?: string;
      autonomyDefault?: AutonomyLevel;
      notifyWebhookUrl?: string | null;
      notifyEmailEnabled?: boolean;
    } = {};
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
    if (body.notifyWebhookUrl !== undefined) {
      if (body.notifyWebhookUrl !== null && typeof body.notifyWebhookUrl !== "string") {
        throw new ApiError("bad_request", "notifyWebhookUrl must be string or null");
      }
      patch.notifyWebhookUrl = body.notifyWebhookUrl;
    }
    if (body.notifyEmailEnabled !== undefined) {
      if (typeof body.notifyEmailEnabled !== "boolean") {
        throw new ApiError("bad_request", "notifyEmailEnabled must be boolean");
      }
      patch.notifyEmailEnabled = body.notifyEmailEnabled;
    }
    if (
      patch.name === undefined &&
      patch.autonomyDefault === undefined &&
      patch.notifyWebhookUrl === undefined &&
      patch.notifyEmailEnabled === undefined
    ) {
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

/** Soft-delete workspace — owner only. Purges GitHub credentials immediately. */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    await requireWorkspaceOwner(db, id, user.id);

    try {
      const workspace = await softDeleteWorkspace(db, {
        workspaceId: id,
        actor: user.id,
      });
      return jsonOk(
        {
          workspace: {
            id: workspace.id,
            status: workspace.status,
            deletedAt: workspace.deletedAt?.toISOString() ?? null,
          },
        },
        { correlationId },
      );
    } catch (err) {
      if (err instanceof DeletionError) {
        throw new ApiError(
          err.code === "not_found" ? "not_found" : "conflict",
          err.message,
        );
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
