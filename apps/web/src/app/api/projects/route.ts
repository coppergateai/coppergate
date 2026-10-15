import {
  createProjectWithRepo,
  getRepositoryConnectionForWorkspace,
  type ProjectMode,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { detectStackForConnection } from "@/lib/detect-stack";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { mapProjectBindError, serializeProject } from "@/lib/project";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Architecture surface: POST /projects */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      name?: unknown;
      mode?: unknown;
      repositoryConnectionId?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.name !== "string") {
      throw new ApiError("bad_request", "name is required");
    }
    if (body.mode !== "new_product" && body.mode !== "existing_repo") {
      throw new ApiError(
        "bad_request",
        "mode must be new_product or existing_repo",
      );
    }
    if (typeof body.repositoryConnectionId !== "string") {
      throw new ApiError("bad_request", "repositoryConnectionId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const mode = body.mode as ProjectMode;
    let stack: string | undefined;
    let stackDetection: { source: string; detail: string } | undefined;

    if (mode === "existing_repo") {
      const connection = await getRepositoryConnectionForWorkspace(
        db,
        body.workspaceId,
        body.repositoryConnectionId,
      );
      if (connection) {
        const detected = await detectStackForConnection(db, connection);
        stack = String(detected.stack);
        stackDetection = {
          source: detected.source,
          detail: detected.detail,
        };
      } else {
        stack = "unknown";
        stackDetection = {
          source: "unknown",
          detail: "connection not found before detect",
        };
      }
    }

    const created = await createProjectWithRepo(db, {
      workspaceId: body.workspaceId,
      name: body.name,
      mode,
      repositoryConnectionId: body.repositoryConnectionId,
      stack,
      stackDetection,
    }).catch(mapProjectBindError);

    logger.info("project created", {
      correlationId,
      workspaceId: body.workspaceId,
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
