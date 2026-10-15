import { resolveApprovalById, type ApprovalStatus } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { mapApprovalError, serializeApproval } from "@/lib/approval";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; approvalId: string }>;
};

const ALLOWED: Array<Exclude<ApprovalStatus, "pending" | "expired">> = [
  "rejected",
  "changes_requested",
];

/**
 * Inbox reject / request-changes — resolves the approval gate without
 * inventing domain rejectBrief / rejectTask transitions.
 */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId, approvalId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const body = (await request.json().catch(() => null)) as {
      decision?: unknown;
      note?: unknown;
    } | null;

    if (
      !body ||
      typeof body.decision !== "string" ||
      !ALLOWED.includes(
        body.decision as Exclude<ApprovalStatus, "pending" | "expired">,
      )
    ) {
      throw new ApiError(
        "bad_request",
        "decision must be rejected or changes_requested",
      );
    }

    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 2000)
        : undefined;

    const row = await resolveApprovalById(db, {
      workspaceId,
      approvalId,
      decision: body.decision as Exclude<
        ApprovalStatus,
        "pending" | "expired"
      >,
      actor: user.id,
      decisionNote: note,
    }).catch(mapApprovalError);

    logger.info("approval resolved from inbox", {
      correlationId,
      workspaceId,
      approvalId,
      decision: row.status,
      userId: user.id,
    });

    return jsonOk(
      { approval: serializeApproval(row, workspaceId) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
