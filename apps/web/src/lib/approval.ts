import type { Approval, InboxApproval } from "@coppergate/db";
import { ApprovalError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export type SerializedApproval = {
  id: string;
  workspaceId: string;
  projectId: string;
  projectName: string | null;
  targetType: string;
  targetId: string;
  title: string | null;
  href: string;
  status: string;
  riskSummary: string | null;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function approvalHref(
  workspaceId: string,
  row: Pick<Approval, "projectId" | "targetType" | "targetId">,
): string {
  if (row.targetType === "task") {
    return `/workspaces/${workspaceId}/projects/${row.projectId}/tasks/${row.targetId}`;
  }
  return `/workspaces/${workspaceId}/projects/${row.projectId}`;
}

export function serializeApproval(
  row: Approval | InboxApproval,
  workspaceId?: string,
): SerializedApproval {
  const ws = workspaceId ?? row.workspaceId;
  const enriched = row as InboxApproval;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    projectName: enriched.projectName ?? null,
    targetType: row.targetType,
    targetId: row.targetId,
    title:
      enriched.title ??
      (row.riskSummary?.trim() || null),
    href: approvalHref(ws, row),
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
