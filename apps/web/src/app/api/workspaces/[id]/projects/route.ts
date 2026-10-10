import {
  createProjectWithRepo,
  listProjectsForWorkspace,
  type ProjectMode,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { mapProjectBindError, serializeProject } from "@/lib/project";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** List projects in a workspace. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const rows = await listProjectsForWorkspace(db, workspaceId);
    return jsonOk(
      { projects: rows.map(serializeProject) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Create a project bound to exactly one repository connection. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      mode?: unknown;
      repositoryConnectionId?: unknown;
    } | null;

    if (!body || typeof body.name !== "string") {
      throw new ApiError("bad_request", "name is required");
    }
    if (
      body.mode !== "new_product" &&
      body.mode !== "existing_repo"
    ) {
      throw new ApiError(
        "bad_request",
        "mode must be new_product or existing_repo",
      );
    }
    if (typeof body.repositoryConnectionId !== "string") {
      throw new ApiError("bad_request", "repositoryConnectionId is required");
    }

    const created = await createProjectWithRepo(db, {
      workspaceId,
      name: body.name,
      mode: body.mode as ProjectMode,
      repositoryConnectionId: body.repositoryConnectionId,
    }).catch(mapProjectBindError);

    logger.info("project created", {
      correlationId,
      workspaceId,
      projectId: created.project.id,
      userId: user.id,
    });

    return jsonOk(
      { project: serializeProject(created) },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
