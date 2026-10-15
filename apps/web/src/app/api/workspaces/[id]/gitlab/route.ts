import {
  getInstallationForWorkspace,
  listRepositoryConnections,
  markInstallationRemoved,
} from "@coppergate/db";
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

/** GitLab install + connected projects for a workspace. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const installation = await getInstallationForWorkspace(db, workspaceId);
    const connections = await listRepositoryConnections(db, workspaceId);
    const isGitlab = installation?.provider === "gitlab";

    return jsonOk(
      {
        installation:
          installation && isGitlab
            ? {
                id: installation.id,
                provider: installation.provider,
                accountLogin: installation.accountLogin,
                status: installation.status,
              }
            : null,
        repositories: connections
          .filter((c) => c.provider === "gitlab" || isGitlab)
          .map((c) => ({
            id: c.id,
            owner: c.owner,
            name: c.name,
            fullName: c.baseRepoFullName,
            defaultBranch: c.defaultBranch,
            status: c.installationStatus,
          })),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Disconnect GitLab installation for the workspace. */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const installation = await getInstallationForWorkspace(db, workspaceId);
    if (installation && installation.provider !== "gitlab") {
      return jsonOk({ ok: true, skipped: true }, { correlationId });
    }

    const removed = await markInstallationRemoved(db, workspaceId);
    logger.info("gitlab disconnected", {
      correlationId,
      workspaceId,
      userId: user.id,
      hadInstall: Boolean(removed),
    });

    return jsonOk({ ok: true }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
