import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  approvals,
  type Approval,
  type ApprovalStatus,
  type ApprovalTargetType,
} from "./schema.js";

/** Transaction or root db — drizzle tx is structurally compatible. */
type DbLike = Pick<Database, "insert" | "update" | "select">;

export class ApprovalError extends Error {
  readonly code: "not_found" | "not_pending" | "conflict";

  constructor(code: ApprovalError["code"], message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

export async function requestApproval(
  db: DbLike,
  input: {
    workspaceId: string;
    projectId: string;
    targetType: ApprovalTargetType;
    targetId: string;
    requestedBy: string;
    riskSummary?: string;
  },
): Promise<Approval> {
  const now = new Date();
  const [row] = await db
    .insert(approvals)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      targetType: input.targetType,
      targetId: input.targetId,
      status: "pending",
      riskSummary: input.riskSummary ?? null,
      evidenceArtifactIds: "[]",
      requestedBy: input.requestedBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create approval");
  return row;
}

export async function expirePendingApprovals(
  db: DbLike,
  targetType: ApprovalTargetType,
  targetIds: string[],
): Promise<number> {
  if (!targetIds.length) return 0;
  const now = new Date();
  const updated = await db
    .update(approvals)
    .set({ status: "expired" satisfies ApprovalStatus, updatedAt: now })
    .where(
      and(
        eq(approvals.targetType, targetType),
        eq(approvals.status, "pending"),
        inArray(approvals.targetId, targetIds),
      ),
    )
    .returning({ id: approvals.id });
  return updated.length;
}

export async function resolvePendingApproval(
  db: DbLike,
  input: {
    workspaceId: string;
    targetType: ApprovalTargetType;
    targetId: string;
    decision: Exclude<ApprovalStatus, "pending" | "expired">;
    actor: string;
    decisionNote?: string;
  },
): Promise<Approval> {
  const now = new Date();
  const [row] = await db
    .update(approvals)
    .set({
      status: input.decision,
      decidedBy: input.actor,
      decisionNote: input.decisionNote ?? null,
      decidedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(approvals.workspaceId, input.workspaceId),
        eq(approvals.targetType, input.targetType),
        eq(approvals.targetId, input.targetId),
        eq(approvals.status, "pending"),
      ),
    )
    .returning();

  if (!row) {
    throw new ApprovalError(
      "not_pending",
      "No pending approval for this target",
    );
  }
  return row;
}

/**
 * Pending approvals in a workspace (inbox). Membership must be checked by caller.
 */
export async function listPendingApprovalsForWorkspace(
  db: Database,
  workspaceId: string,
): Promise<Approval[]> {
  return db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.status, "pending"),
      ),
    )
    .orderBy(asc(approvals.createdAt));
}

export async function getApprovalForWorkspace(
  db: Database,
  workspaceId: string,
  approvalId: string,
): Promise<Approval | undefined> {
  const [row] = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.id, approvalId), eq(approvals.workspaceId, workspaceId)),
    )
    .limit(1);
  return row;
}
