import {
  listInboxApprovalsForWorkspace,
  type ApprovalTargetType,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { serializeApproval } from "@/lib/approval";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const TARGET_TYPES = new Set<ApprovalTargetType>([
  "brief",
  "milestone",
  "task",
  "run_review",
  "merge",
]);

/**
 * Review inbox — pending or recently decided approvals for the caller's workspace.
 */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "pending";
    if (statusParam !== "pending" && statusParam !== "decided") {
      throw new ApiError("bad_request", "status must be pending or decided");
    }

    const typeParam = url.searchParams.get("type");
    let type: ApprovalTargetType | undefined;
    if (typeParam) {
      if (!TARGET_TYPES.has(typeParam as ApprovalTargetType)) {
        throw new ApiError("bad_request", "invalid type filter");
      }
      type = typeParam as ApprovalTargetType;
    }

    const rows = await listInboxApprovalsForWorkspace(db, workspaceId, {
      status: statusParam,
      type,
    });

    return jsonOk(
      {
        approvals: rows.map((r) => serializeApproval(r, workspaceId)),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
