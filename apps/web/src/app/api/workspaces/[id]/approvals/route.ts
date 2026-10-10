import { listPendingApprovalsForWorkspace } from "@coppergate/db";
import { requireUser } from "@/lib/auth";
import { serializeApproval } from "@/lib/approval";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Review inbox (read path) — pending approvals for the caller's workspace only.
 */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    if (status !== "pending") {
      // TASK011 scope: pending inbox only
      return jsonOk({ approvals: [] }, { correlationId });
    }

    const rows = await listPendingApprovalsForWorkspace(db, workspaceId);
    return jsonOk(
      { approvals: rows.map(serializeApproval) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
