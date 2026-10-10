import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  auditEvents,
  budgets,
  projects,
  usageEvents,
  type Budget,
  type UsageEvent,
  type UsageKind,
} from "./schema.js";

export class BudgetError extends Error {
  readonly code: "not_found" | "invalid" | "insufficient" | "paused";

  constructor(code: BudgetError["code"], message: string) {
    super(message);
    this.name = "BudgetError";
    this.code = code;
  }
}

export type ProjectSpendSummary = {
  projectId: string;
  workspaceId: string;
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
};

type DbLike = Pick<Database, "insert" | "update" | "select">;

const SPENT_KINDS: UsageKind[] = [
  "llm_tokens",
  "sandbox_seconds",
  "adjustment",
];

export async function setProjectBudget(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    capMicros: number;
    softAlertMicros?: number | null;
    actor: string;
    status?: "active" | "paused";
  },
): Promise<Budget> {
  if (!Number.isFinite(input.capMicros) || input.capMicros < 0) {
    throw new BudgetError("invalid", "capMicros must be a non-negative number");
  }

  return db.transaction(async (tx) => {
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
      throw new BudgetError("not_found", "Project not found");
    }

    const now = new Date();
    const [existing] = await tx
      .select()
      .from(budgets)
      .where(eq(budgets.projectId, input.projectId))
      .limit(1);

    let budget: Budget | undefined;
    if (existing) {
      [budget] = await tx
        .update(budgets)
        .set({
          capMicros: input.capMicros,
          softAlertMicros:
            input.softAlertMicros === undefined
              ? existing.softAlertMicros
              : input.softAlertMicros,
          status: input.status ?? existing.status,
          updatedAt: now,
        })
        .where(eq(budgets.id, existing.id))
        .returning();
    } else {
      [budget] = await tx
        .insert(budgets)
        .values({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          capMicros: input.capMicros,
          softAlertMicros: input.softAlertMicros ?? null,
          currency: "USD",
          status: input.status ?? "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    if (!budget) throw new Error("Failed to upsert budget");

    await tx
      .update(projects)
      .set({ maxBudgetMicros: input.capMicros, updatedAt: now })
      .where(eq(projects.id, input.projectId));

    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "budget.set",
      targetType: "project",
      targetId: input.projectId,
      meta: JSON.stringify({ capMicros: input.capMicros }),
      createdAt: now,
    });

    return budget;
  });
}

async function sumUsage(
  db: DbLike,
  projectId: string,
  kinds: UsageKind[],
): Promise<number> {
  if (!kinds.length) return 0;
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.projectId, projectId),
        inArray(usageEvents.kind, kinds),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getProjectSpendSummary(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProjectSpendSummary> {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!project) {
    throw new BudgetError("not_found", "Project not found");
  }

  const [budget] = await db
    .select()
    .from(budgets)
    .where(eq(budgets.projectId, projectId))
    .limit(1);

  const capMicros = budget?.capMicros ?? project.maxBudgetMicros;
  const spentMicros = await sumUsage(db, projectId, SPENT_KINDS);
  const reserved =
    (await sumUsage(db, projectId, ["estimate_reserve"])) -
    (await sumUsage(db, projectId, ["estimate_release"]));
  const reservedMicros = Math.max(0, reserved);
  const availableMicros = Math.max(0, capMicros - spentMicros - reservedMicros);

  // Keep denormalized spent cache aligned with ledger actuals
  if (project.spentMicros !== spentMicros) {
    await db
      .update(projects)
      .set({ spentMicros, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  return {
    projectId,
    workspaceId,
    capMicros,
    spentMicros,
    reservedMicros,
    availableMicros,
    currency: budget?.currency ?? "USD",
    budgetStatus: budget?.status ?? "active",
  };
}

export async function assertSufficientBudget(
  db: Database,
  workspaceId: string,
  projectId: string,
  estimateMicros: number,
): Promise<ProjectSpendSummary> {
  const summary = await getProjectSpendSummary(db, workspaceId, projectId);
  if (summary.budgetStatus === "paused") {
    throw new BudgetError("paused", "Project budget is paused");
  }
  if (estimateMicros > 0 && summary.availableMicros < estimateMicros) {
    throw new BudgetError(
      "insufficient",
      "Insufficient project budget for task estimate",
    );
  }
  return summary;
}

export async function appendUsageEvent(
  db: DbLike,
  input: {
    workspaceId: string;
    projectId: string;
    taskId?: string | null;
    runId?: string | null;
    kind: UsageKind;
    costMicros: number;
    quantity?: string;
    provider?: string;
    model?: string;
    meta?: unknown;
  },
): Promise<UsageEvent> {
  const [row] = await db
    .insert(usageEvents)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      kind: input.kind,
      quantity: input.quantity ?? "0",
      costMicros: input.costMicros,
      provider: input.provider ?? null,
      model: input.model ?? null,
      meta: input.meta === undefined ? null : JSON.stringify(input.meta),
      createdAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to append usage event");
  return row;
}

/**
 * Reserve estimate on queue (FR-07). Does not increase spent_micros.
 */
export async function reserveEstimateForTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    estimateMicros: number;
  },
): Promise<UsageEvent | null> {
  if (input.estimateMicros <= 0) return null;
  await assertSufficientBudget(
    db,
    input.workspaceId,
    input.projectId,
    input.estimateMicros,
  );
  return appendUsageEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    kind: "estimate_reserve",
    costMicros: input.estimateMicros,
    quantity: "1",
    meta: { taskId: input.taskId },
  });
}

export async function releaseEstimateForTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    amountMicros: number;
  },
): Promise<UsageEvent | null> {
  if (input.amountMicros <= 0) return null;
  return appendUsageEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    kind: "estimate_release",
    costMicros: input.amountMicros,
    quantity: "1",
    meta: { taskId: input.taskId },
  });
}
