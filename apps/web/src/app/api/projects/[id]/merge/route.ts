import {
  getProjectForWorkspace,
  setProjectMergeEnabled,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** TASK043 — toggle L2 merge opt-in (default off). */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      mergeEnabled?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    if (typeof body.mergeEnabled !== "boolean") {
      throw new ApiError("bad_request", "mergeEnabled boolean required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const bound = await getProjectForWorkspace(db, body.workspaceId, projectId);
    if (!bound) throw new ApiError("not_found", "project not found");
    const project = await setProjectMergeEnabled(db, {
      workspaceId: body.workspaceId,
      projectId,
      mergeEnabled: body.mergeEnabled,
      actor: user.id,
    });
    return jsonOk(
      {
        project: {
          id: project.id,
          mergeEnabled: project.mergeEnabled,
          autonomyLevel: project.autonomyLevel,
        },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
