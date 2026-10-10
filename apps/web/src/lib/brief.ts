import type { ProductBrief } from "@coppergate/db";
import {
  BriefError,
  parseClarifyingAnswers,
  parseJsonArray,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export function serializeBrief(brief: ProductBrief) {
  return {
    id: brief.id,
    workspaceId: brief.workspaceId,
    projectId: brief.projectId,
    revision: brief.revision,
    status: brief.status,
    title: brief.title,
    targetUser: brief.targetUser,
    problem: brief.problem,
    scope: brief.scope,
    nonGoals: brief.nonGoals,
    acceptanceCriteria: parseJsonArray(brief.acceptanceCriteria),
    rawIdea: brief.rawIdea,
    clarifyingAnswers: parseClarifyingAnswers(brief.clarifyingAnswers),
    createdBy: brief.createdBy,
    approvedBy: brief.approvedBy,
    approvedAt: brief.approvedAt?.toISOString() ?? null,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
  };
}

export function mapBriefError(err: unknown): never {
  if (err instanceof BriefError) {
    switch (err.code) {
      case "not_found":
      case "wrong_workspace":
        throw new ApiError("not_found", err.message);
      case "not_draft":
      case "already_approved":
      case "incomplete":
      case "no_approved_brief":
        throw new ApiError("conflict", err.message);
    }
  }
  throw err;
}
