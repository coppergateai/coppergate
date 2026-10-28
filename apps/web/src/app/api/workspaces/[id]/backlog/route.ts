import { getWorkspaceOpenProgramBacklog } from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Workspace Open Program backlog with runtime in-flight overlay. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const backlog = await getWorkspaceOpenProgramBacklog(db, workspaceId);

    return jsonOk({ backlog }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
