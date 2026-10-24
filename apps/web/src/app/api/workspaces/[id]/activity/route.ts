import {
  listAuditEventsForWorkspace,
  listProjectsForWorkspace,
} from "@coppergate/db";
import { activityHref } from "@/lib/activity-href";
import { withProjectName } from "@/lib/activity-meta";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Workspace activity timeline from audit_events. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

    const [rows, projectRows] = await Promise.all([
      listAuditEventsForWorkspace(db, workspaceId, {
        limit,
        before,
      }),
      listProjectsForWorkspace(db, workspaceId),
    ]);

    const projectNameById = new Map(
      projectRows.map(({ project }) => [project.id, project.name]),
    );

    return jsonOk(
      {
        events: rows.map((r) => {
          const meta = withProjectName(parseMeta(r.meta), projectNameById);
          return {
            id: r.id,
            actor: r.actor,
            action: r.action,
            targetType: r.targetType,
            targetId: r.targetId,
            meta,
            href: activityHref(
              workspaceId,
              r.action,
              meta,
              r.targetType,
              r.targetId,
            ),
            createdAt: r.createdAt.toISOString(),
          };
        }),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
