import {
  getRepositoryConnectionForWorkspace,
  listProjectsForWorkspace,
  updateProjectStack,
} from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { detectStackForConnection } from "@/lib/detect-stack";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { serializeProject } from "@/lib/project";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Re-detect stack labels for all projects in a workspace (owner). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const rows = await listProjectsForWorkspace(db, workspaceId);
    const updated: ReturnType<typeof serializeProject>[] = [];
    let failed = 0;

    for (const row of rows) {
      const connection = await getRepositoryConnectionForWorkspace(
        db,
        workspaceId,
        row.repository.id,
      );
      if (!connection) {
        failed += 1;
        continue;
      }

      const detected = await detectStackForConnection(db, connection);
      const next = await updateProjectStack(db, {
        workspaceId,
        projectId: row.project.id,
        stack: String(detected.stack),
        stackDetection: {
          source: detected.source,
          detail: detected.detail,
        },
      });

      if (next) {
        updated.push(serializeProject(next));
      } else {
        failed += 1;
      }
    }

    logger.info("stacks redetected", {
      correlationId,
      workspaceId,
      userId: user.id,
      updated: updated.length,
      failed,
    });

    return jsonOk(
      {
        updated: updated.length,
        failed,
        projects: updated,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
