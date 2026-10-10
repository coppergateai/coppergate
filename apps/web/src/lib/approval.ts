import type { Approval } from "@coppergate/db";
import { ApprovalError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export function serializeApproval(row: Approval) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    targetType: row.targetType,
    targetId: row.targetId,
    status: row.status,
    riskSummary: row.riskSummary,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapApprovalError(err: unknown): never {
  if (err instanceof ApprovalError) {
    switch (err.code) {
      case "not_found":
        throw new ApiError("not_found", err.message);
      case "not_pending":
      case "conflict":
        throw new ApiError("conflict", err.message);
    }
  }
  throw err;
}
