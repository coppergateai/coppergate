import { and, desc, eq, sql } from "drizzle-orm";
import {
  ApprovalError,
  expirePendingApprovals,
  requestApproval,
  resolvePendingApproval,
} from "./approvals.js";
import type { Database } from "./client.js";
import { notifyWorkspace } from "./notify.js";
import { redactPayload, redactString } from "./redact.js";
import {
  auditEvents,
  productBriefs,
  projects,
  type BriefStatus,
  type ProductBrief,
} from "./schema.js";

export class BriefError extends Error {
  readonly code:
    | "not_found"
    | "wrong_workspace"
    | "not_draft"
    | "already_approved"
    | "incomplete"
    | "no_approved_brief";

  constructor(code: BriefError["code"], message: string) {
    super(message);
    this.name = "BriefError";
    this.code = code;
  }
}

export type ClarifyingAnswer = {
  id: string;
  question: string;
  answer: string | null;
};

export type BriefContentInput = {
  title: string;
  targetUser: string;
  problem: string;
  scope: string;
  nonGoals: string;
  acceptanceCriteria: string[];
  clarifyingAnswers: ClarifyingAnswer[];
};

export function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function parseClarifyingAnswers(raw: string): ClarifyingAnswer[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is ClarifyingAnswer =>
          !!x &&
          typeof x === "object" &&
          typeof (x as ClarifyingAnswer).id === "string" &&
          typeof (x as ClarifyingAnswer).question === "string",
      )
      .slice(0, 3)
      .map((x) => ({
        id: x.id,
        question: x.question,
        answer: typeof x.answer === "string" ? x.answer : null,
      }));
  } catch {
    return [];
  }
}

export async function recordAuditEvent(
  db: Database,
  input: {
    workspaceId?: string | null;
    actor: string;
    action: string;
    targetType?: string;
    targetId?: string;
    ip?: string;
    meta?: unknown;
  },
): Promise<void> {
  const meta =
    input.meta === undefined
      ? null
      : JSON.stringify(
          typeof input.meta === "object" && input.meta !== null
            ? redactPayload(input.meta as Record<string, unknown>)
            : { value: redactString(String(input.meta)) },
        );
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId ?? null,
    actor: input.actor,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ip: input.ip ?? null,
    meta,
    createdAt: new Date(),
  });
}

export async function getBriefForProject(
  db: Database,
  workspaceId: string,
  projectId: string,
  briefId: string,
): Promise<ProductBrief | undefined> {
  const [row] = await db
    .select()
    .from(productBriefs)
    .where(
      and(
        eq(productBriefs.id, briefId),
        eq(productBriefs.projectId, projectId),
        eq(productBriefs.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row;
}

export async function getLatestBriefForProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProductBrief | undefined> {
  const [row] = await db
    .select()
    .from(productBriefs)
    .where(
      and(
        eq(productBriefs.projectId, projectId),
        eq(productBriefs.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(productBriefs.revision))
    .limit(1);
  return row;
}

export async function listBriefsForProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProductBrief[]> {
  return db
    .select()
    .from(productBriefs)
    .where(
      and(
        eq(productBriefs.projectId, projectId),
        eq(productBriefs.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(productBriefs.revision));
}

/**
 * Insert a new draft revision. Prior draft revisions for the project become superseded.
 */
export async function createBriefDraft(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    rawIdea: string;
    content: BriefContentInput;
  },
): Promise<ProductBrief> {
  const brief = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);

    if (!project) {
      throw new BriefError("not_found", "Project not found");
    }

    const revRows = await tx
      .select({
        maxRev: sql<number>`coalesce(max(${productBriefs.revision}), 0)`,
      })
      .from(productBriefs)
      .where(eq(productBriefs.projectId, input.projectId));
    const nextRevision = Number(revRows[0]?.maxRev ?? 0) + 1;

    const now = new Date();
    const priorDrafts = await tx
      .select({ id: productBriefs.id })
      .from(productBriefs)
      .where(
        and(
          eq(productBriefs.projectId, input.projectId),
          eq(productBriefs.status, "draft"),
        ),
      );

    if (priorDrafts.length) {
      await expirePendingApprovals(
        tx,
        "brief",
        priorDrafts.map((d) => d.id),
      );
    }

    await tx
      .update(productBriefs)
      .set({ status: "superseded" satisfies BriefStatus, updatedAt: now })
      .where(
        and(
          eq(productBriefs.projectId, input.projectId),
          eq(productBriefs.status, "draft"),
        ),
      );

    const [brief] = await tx
      .insert(productBriefs)
      .values({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        revision: nextRevision,
        status: "draft",
        title: input.content.title.trim() || "Untitled brief",
        targetUser: input.content.targetUser,
        problem: input.content.problem,
        scope: input.content.scope,
        nonGoals: input.content.nonGoals,
        acceptanceCriteria: JSON.stringify(
          input.content.acceptanceCriteria.slice(0, 20),
        ),
        rawIdea: input.rawIdea.trim(),
        clarifyingAnswers: JSON.stringify(
          input.content.clarifyingAnswers.slice(0, 3),
        ),
        createdBy: input.actor,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!brief) throw new Error("Failed to create brief");

    await requestApproval(tx, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      targetType: "brief",
      targetId: brief.id,
      requestedBy: input.actor,
      riskSummary: `Brief r${brief.revision}: ${brief.title}`,
    });

    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "brief.generate",
      targetType: "brief",
      targetId: brief.id,
      meta: JSON.stringify({ revision: brief.revision }),
      createdAt: now,
    });

    return brief;
  });

  void notifyWorkspace(db, {
    event: "approval_needed",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    message: `Brief ready for approval: ${brief.title}`,
    meta: { briefId: brief.id, revision: brief.revision },
  }).catch(() => undefined);

  return brief;
}

export async function updateBriefDraft(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    briefId: string;
    actor: string;
    patch: Partial<{
      title: string;
      targetUser: string;
      problem: string;
      scope: string;
      nonGoals: string;
      acceptanceCriteria: string[];
      clarifyingAnswers: ClarifyingAnswer[];
    }>;
  },
): Promise<ProductBrief> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productBriefs)
      .where(
        and(
          eq(productBriefs.id, input.briefId),
          eq(productBriefs.projectId, input.projectId),
          eq(productBriefs.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new BriefError("not_found", "Brief not found");
    }
    if (existing.status !== "draft") {
      throw new BriefError("not_draft", "Only draft briefs can be edited");
    }

    const now = new Date();
    const [updated] = await tx
      .update(productBriefs)
      .set({
        ...(input.patch.title !== undefined
          ? { title: input.patch.title.trim() || existing.title }
          : {}),
        ...(input.patch.targetUser !== undefined
          ? { targetUser: input.patch.targetUser }
          : {}),
        ...(input.patch.problem !== undefined
          ? { problem: input.patch.problem }
          : {}),
        ...(input.patch.scope !== undefined ? { scope: input.patch.scope } : {}),
        ...(input.patch.nonGoals !== undefined
          ? { nonGoals: input.patch.nonGoals }
          : {}),
        ...(input.patch.acceptanceCriteria !== undefined
          ? {
              acceptanceCriteria: JSON.stringify(
                input.patch.acceptanceCriteria.slice(0, 20),
              ),
            }
          : {}),
        ...(input.patch.clarifyingAnswers !== undefined
          ? {
              clarifyingAnswers: JSON.stringify(
                input.patch.clarifyingAnswers.slice(0, 3),
              ),
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(productBriefs.id, existing.id))
      .returning();

    if (!updated) throw new Error("Failed to update brief");

    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "brief.edit",
      targetType: "brief",
      targetId: updated.id,
      meta: JSON.stringify({ fields: Object.keys(input.patch) }),
      createdAt: now,
    });

    return updated;
  });
}

function isBriefComplete(brief: ProductBrief): boolean {
  const criteria = parseJsonArray(brief.acceptanceCriteria);
  return (
    brief.title.trim().length > 0 &&
    brief.targetUser.trim().length > 0 &&
    brief.problem.trim().length > 0 &&
    brief.scope.trim().length > 0 &&
    criteria.length > 0
  );
}

/**
 * Approve a draft brief: mark approved, supersede prior approved, set projects.current_brief_id.
 */
export async function approveBrief(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    briefId: string;
    actor: string;
  },
): Promise<ProductBrief> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productBriefs)
      .where(
        and(
          eq(productBriefs.id, input.briefId),
          eq(productBriefs.projectId, input.projectId),
          eq(productBriefs.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new BriefError("not_found", "Brief not found");
    }
    if (existing.status === "approved") {
      throw new BriefError("already_approved", "Brief is already approved");
    }
    if (existing.status !== "draft") {
      throw new BriefError("not_draft", "Only draft briefs can be approved");
    }
    if (!isBriefComplete(existing)) {
      throw new BriefError(
        "incomplete",
        "Brief needs title, target user, problem, scope, and acceptance criteria",
      );
    }

    const now = new Date();

    await tx
      .update(productBriefs)
      .set({ status: "superseded", updatedAt: now })
      .where(
        and(
          eq(productBriefs.projectId, input.projectId),
          eq(productBriefs.status, "approved"),
        ),
      );

    const [approved] = await tx
      .update(productBriefs)
      .set({
        status: "approved",
        approvedBy: input.actor,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(productBriefs.id, existing.id))
      .returning();

    if (!approved) throw new Error("Failed to approve brief");

    await tx
      .update(projects)
      .set({ currentBriefId: approved.id, updatedAt: now })
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, input.workspaceId),
        ),
      );

    try {
      await resolvePendingApproval(tx, {
        workspaceId: input.workspaceId,
        targetType: "brief",
        targetId: approved.id,
        decision: "approved",
        actor: input.actor,
        decisionNote: "brief approved",
      });
    } catch (err) {
      if (!(err instanceof ApprovalError && err.code === "not_pending")) {
        throw err;
      }
    }

    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "brief.approve",
      targetType: "brief",
      targetId: approved.id,
      meta: JSON.stringify({ revision: approved.revision }),
      createdAt: now,
    });

    return approved;
  });
}

/**
 * FR-02 gate: tasks cannot start without an approved current brief.
 */
export async function assertCanStartTasks(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProductBrief> {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!project) {
    throw new BriefError("not_found", "Project not found");
  }
  if (!project.currentBriefId) {
    throw new BriefError(
      "no_approved_brief",
      "Approve a product brief before starting tasks",
    );
  }

  const [brief] = await db
    .select()
    .from(productBriefs)
    .where(eq(productBriefs.id, project.currentBriefId))
    .limit(1);

  if (!brief || brief.status !== "approved") {
    throw new BriefError(
      "no_approved_brief",
      "Approve a product brief before starting tasks",
    );
  }

  return brief;
}
