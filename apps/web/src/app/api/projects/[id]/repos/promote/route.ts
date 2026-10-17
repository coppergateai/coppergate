import {
  getProjectForWorkspace,
  ProjectBindError,
  promotePrimaryRepo,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      repositoryConnectionId?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    if (typeof body.repositoryConnectionId !== "string") {
      throw new ApiError("bad_request", "repositoryConnectionId required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const bound = await getProjectForWorkspace(db, body.workspaceId, projectId);
    if (!bound) throw new ApiError("not_found", "project not found");

    try {
      const result = await promotePrimaryRepo(db, {
        workspaceId: body.workspaceId,
        projectId,
        repositoryConnectionId: body.repositoryConnectionId,
      });
      return jsonOk(
        {
          primary: {
            id: result.primary.id,
            fullName: result.primary.baseRepoFullName,
            role: result.primary.repoRole,
          },
          previous: {
            id: result.previous.id,
            fullName: result.previous.baseRepoFullName,
            role: result.previous.repoRole,
          },
        },
        { correlationId },
      );
    } catch (err) {
      if (err instanceof ProjectBindError) {
        throw new ApiError(
          err.code === "not_found" ? "not_found" : "bad_request",
          err.message,
        );
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
