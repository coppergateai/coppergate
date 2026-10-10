import {
  DeletionError,
  archiveProject,
  getProjectForWorkspace,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { serializeProject } from "@/lib/project";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Get a project by id. Requires `workspaceId` query for membership scoping (IDOR-safe).
 */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId query is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);
    const row = await getProjectForWorkspace(db, workspaceId, projectId);
    if (!row) {
      throw new ApiError("not_found", "Project not found");
    }
    return jsonOk({ project: serializeProject(row) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Archive (soft-delete) a project — owner only. */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId query is required");
    }

    await requireWorkspaceOwner(db, workspaceId, user.id);

    try {
      const project = await archiveProject(db, {
        workspaceId,
        projectId,
        actor: user.id,
      });
      return jsonOk(
        { project: { id: project.id, status: project.status } },
        { correlationId },
      );
    } catch (err) {
      if (err instanceof DeletionError) {
        throw new ApiError("not_found", err.message);
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
