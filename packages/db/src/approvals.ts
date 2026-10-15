import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "./client.js";
import {
  approvals,
  productBriefs,
  projects,
  tasks,
  type Approval,
  type ApprovalStatus,
  type ApprovalTargetType,
} from "./schema.js";

export type InboxApproval = Approval & {
  projectName: string;
  title: string | null;
};

export type ListInboxApprovalsOptions = {
  /** pending (default) or decided (approved/rejected/changes_requested/expired) */
  status?: "pending" | "decided";
  /** Optional target type filter */
  type?: ApprovalTargetType;
  /** For decided: lookback window in ms (default 14 days) */
  decidedWithinMs?: number;
};

const DECIDED_STATUSES: ApprovalStatus[] = [
  "approved",
  "rejected",
  "changes_requested",
  "expired",
];

const DEFAULT_DECIDED_WITHIN_MS = 14 * 24 * 60 * 60 * 1000;

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
 * Pending approvals in a workspace (inbox badge). Membership must be checked by caller.
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

/**
 * Enriched inbox rows: project name + brief/task title when available.
 */
export async function listInboxApprovalsForWorkspace(
  db: Database,
  workspaceId: string,
  options: ListInboxApprovalsOptions = {},
): Promise<InboxApproval[]> {
  const statusMode = options.status ?? "pending";
  const decidedWithinMs =
    options.decidedWithinMs ?? DEFAULT_DECIDED_WITHIN_MS;

  const conditions = [eq(approvals.workspaceId, workspaceId)];

  if (statusMode === "pending") {
    conditions.push(eq(approvals.status, "pending"));
  } else {
    const since = new Date(Date.now() - decidedWithinMs);
    conditions.push(inArray(approvals.status, DECIDED_STATUSES));
    // Prefer typed column compares — raw sql`…` + Date binding throws
    // "string argument … Received an instance of Date" via postgres.js.
    conditions.push(
      or(
        gte(approvals.decidedAt, since),
        and(isNull(approvals.decidedAt), gte(approvals.updatedAt, since)),
      )!,
    );
  }

  if (options.type) {
    conditions.push(eq(approvals.targetType, options.type));
  }

  const rows = await db
    .select({
      approval: approvals,
      projectName: projects.name,
      briefTitle: productBriefs.title,
      taskTitle: tasks.title,
    })
    .from(approvals)
    .innerJoin(projects, eq(projects.id, approvals.projectId))
    .leftJoin(
      productBriefs,
      and(
        eq(productBriefs.id, approvals.targetId),
        eq(approvals.targetType, "brief"),
      ),
    )
    .leftJoin(
      tasks,
      and(eq(tasks.id, approvals.targetId), eq(approvals.targetType, "task")),
    )
    .where(and(...conditions))
    .orderBy(
      statusMode === "pending"
        ? asc(approvals.createdAt)
        : desc(
            sql`coalesce(${approvals.decidedAt}, ${approvals.updatedAt})`,
          ),
    );

  return rows.map((r) => {
    const title =
      r.briefTitle ??
      r.taskTitle ??
      (r.approval.riskSummary?.trim() || null);
    return {
      ...r.approval,
      projectName: r.projectName,
      title,
    };
  });
}

/** Convenience wrapper for recent decisions (last 14 days). */
export async function listRecentDecidedApprovalsForWorkspace(
  db: Database,
  workspaceId: string,
  type?: ApprovalTargetType,
): Promise<InboxApproval[]> {
  return listInboxApprovalsForWorkspace(db, workspaceId, {
    status: "decided",
    type,
  });
}

/**
 * Resolve a pending approval by id (inbox reject / changes_requested).
 */
export async function resolveApprovalById(
  db: Database,
  input: {
    workspaceId: string;
    approvalId: string;
    decision: Exclude<ApprovalStatus, "pending" | "expired">;
    actor: string;
    decisionNote?: string;
  },
): Promise<Approval> {
  const existing = await getApprovalForWorkspace(
    db,
    input.workspaceId,
    input.approvalId,
  );
  if (!existing) {
    throw new ApprovalError("not_found", "Approval not found");
  }
  if (existing.status !== "pending") {
    throw new ApprovalError("not_pending", "Approval is not pending");
  }
  return resolvePendingApproval(db, {
    workspaceId: input.workspaceId,
    targetType: existing.targetType as ApprovalTargetType,
    targetId: existing.targetId,
    decision: input.decision,
    actor: input.actor,
    decisionNote: input.decisionNote,
  });
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

export async function getInboxApprovalForWorkspace(
  db: Database,
  workspaceId: string,
  approvalId: string,
): Promise<InboxApproval | undefined> {
  const rows = await db
    .select({
      approval: approvals,
      projectName: projects.name,
      briefTitle: productBriefs.title,
      taskTitle: tasks.title,
    })
    .from(approvals)
    .innerJoin(projects, eq(projects.id, approvals.projectId))
    .leftJoin(
      productBriefs,
      and(
        eq(productBriefs.id, approvals.targetId),
        eq(approvals.targetType, "brief"),
      ),
    )
    .leftJoin(
      tasks,
      and(eq(tasks.id, approvals.targetId), eq(approvals.targetType, "task")),
    )
    .where(
      and(eq(approvals.id, approvalId), eq(approvals.workspaceId, workspaceId)),
    )
    .limit(1);

  const r = rows[0];
  if (!r) return undefined;
  return {
    ...r.approval,
    projectName: r.projectName,
    title:
      r.briefTitle ??
      r.taskTitle ??
      (r.approval.riskSummary?.trim() || null),
  };
}
