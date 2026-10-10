import {
  getRepositoryConnectionForWorkspace,
  revokeRepositoryConnection,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; connectionId: string }>;
};

/** Revoke a selected repository connection (FR-01). */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId, connectionId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const existing = await getRepositoryConnectionForWorkspace(
      db,
      workspaceId,
      connectionId,
    );
    if (!existing) {
      throw new ApiError("not_found", "Repository connection not found");
    }

    await revokeRepositoryConnection(db, workspaceId, connectionId);
    logger.info("repository revoked", {
      correlationId,
      workspaceId,
      connectionId,
      userId: user.id,
    });

    return jsonOk({ ok: true }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
