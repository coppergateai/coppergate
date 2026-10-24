import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  agentRuns,
  auditEvents,
  budgets,
  projects,
  usageEvents,
  type Budget,
  type UsageEvent,
  type UsageKind,
} from "./schema.js";

const ACTIVE_RESERVE_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
] as const;

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
  /** Spend used for enforcement (workspace pool total when pooled). */
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
  /** true when a workspace-level (projectId null) budget is active. */
  pooled?: boolean;
  /** This project's own period spend (informational when pooled). */
  projectSpentMicros?: number;
};

export type WorkspaceSpendSummary = {
  workspaceId: string;
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
  period: string;
  periodStartedAt: Date | null;
  budgetId: string;
};

type DbLike = Pick<Database, "insert" | "update" | "select">;

const SPENT_KINDS: UsageKind[] = [
  "llm_tokens",
  "sandbox_seconds",
  "adjustment",
];

export async function setWorkspaceBudget(
  db: Database,
  input: {
    workspaceId: string;
    capMicros: number;
    softAlertMicros?: number | null;
    actor: string;
    status?: "active" | "paused";
    period?: "lifetime" | "monthly";
    /** When true (default), pause all project-scoped budgets in the workspace. */
    pauseProjectBudgets?: boolean;
  },
): Promise<Budget> {
  if (!Number.isFinite(input.capMicros) || input.capMicros < 0) {
    throw new BudgetError("invalid", "capMicros must be a non-negative number");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const period = input.period ?? "monthly";
    const [existing] = await tx
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.workspaceId, input.workspaceId),
          isNull(budgets.projectId),
        ),
      )
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
          period,
          periodStartedAt:
            period === "monthly"
              ? (existing.periodStartedAt ?? now)
              : null,
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
          projectId: null,
          capMicros: input.capMicros,
          softAlertMicros: input.softAlertMicros ?? null,
          currency: "USD",
          status: input.status ?? "active",
          period,
          periodStartedAt: period === "monthly" ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    if (!budget) throw new Error("Failed to upsert workspace budget");

    if (input.pauseProjectBudgets !== false) {
      await tx
        .update(budgets)
        .set({ status: "paused", updatedAt: now })
        .where(
          and(
            eq(budgets.workspaceId, input.workspaceId),
            sql`${budgets.projectId} is not null`,
          ),
        );
    }

    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "budget.set_workspace",
      targetType: "workspace",
      targetId: input.workspaceId,
      meta: JSON.stringify({
        capMicros: input.capMicros,
        period,
        pauseProjectBudgets: input.pauseProjectBudgets !== false,
      }),
      createdAt: now,
    });

    return budget;
  });
}

export async function setProjectBudget(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    capMicros: number;
    softAlertMicros?: number | null;
    actor: string;
    status?: "active" | "paused";
    /** lifetime (default) | monthly */
    period?: "lifetime" | "monthly";
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
    const period = input.period ?? "lifetime";
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
          period,
          periodStartedAt:
            period === "monthly"
              ? (existing.periodStartedAt ?? now)
              : null,
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
          period,
          periodStartedAt: period === "monthly" ? now : null,
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
      meta: JSON.stringify({
        capMicros: input.capMicros,
        period,
      }),
      createdAt: now,
    });

    return budget;
  });
}

async function sumUsage(
  db: DbLike,
  projectId: string,
  kinds: UsageKind[],
  since?: Date | null,
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
        since ? gte(usageEvents.createdAt, since) : undefined,
      ),
    );
  return Number(row?.total ?? 0);
}

async function sumWorkspaceUsage(
  db: DbLike,
  workspaceId: string,
  kinds: UsageKind[],
  since?: Date | null,
): Promise<number> {
  if (!kinds.length) return 0;
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, workspaceId),
        inArray(usageEvents.kind, kinds),
        since ? gte(usageEvents.createdAt, since) : undefined,
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getWorkspaceBudgetRow(
  db: DbLike,
  workspaceId: string,
): Promise<Budget | null> {
  const [row] = await db
    .select()
    .from(budgets)
    .where(
      and(eq(budgets.workspaceId, workspaceId), isNull(budgets.projectId)),
    )
    .limit(1);
  return row ?? null;
}

/** True when monthly period started ≥ ~30 days ago (or calendar month crossed). */
export function shouldRollMonthlyPeriod(
  periodStartedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!periodStartedAt) return true;
  const ms = now.getTime() - periodStartedAt.getTime();
  if (ms >= 30 * 24 * 60 * 60 * 1000) return true;
  return (
    periodStartedAt.getUTCFullYear() !== now.getUTCFullYear() ||
    periodStartedAt.getUTCMonth() !== now.getUTCMonth()
  );
}

async function rollBudgetRow(
  db: Database,
  input: {
    workspaceId: string;
    budget: Budget;
    actor: string;
    targetType: "workspace" | "project";
    targetId: string;
  },
): Promise<{ rolled: boolean; budget: Budget }> {
  const { budget } = input;
  if (budget.period !== "monthly") {
    return { rolled: false, budget };
  }
  if (!shouldRollMonthlyPeriod(budget.periodStartedAt)) {
    return { rolled: false, budget };
  }
  const now = new Date();
  const [updated] = await db
    .update(budgets)
    .set({
      periodStartedAt: now,
      status: "active",
      updatedAt: now,
    })
    .where(eq(budgets.id, budget.id))
    .returning();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "budget.period_roll",
    targetType: input.targetType,
    targetId: input.targetId,
    meta: JSON.stringify({
      previousPeriodStartedAt: budget.periodStartedAt?.toISOString() ?? null,
      periodStartedAt: now.toISOString(),
    }),
    createdAt: now,
  });
  return { rolled: true, budget: updated ?? budget };
}

/**
 * Roll monthly budget window: workspace pool first, else project budget.
 */
export async function rollMonthlyBudgetIfDue(
  db: Database,
  input: { workspaceId: string; projectId: string; actor: string },
): Promise<{ rolled: boolean; budget: Budget | null }> {
  const wsBudget = await getWorkspaceBudgetRow(db, input.workspaceId);
  if (wsBudget) {
    return rollBudgetRow(db, {
      workspaceId: input.workspaceId,
      budget: wsBudget,
      actor: input.actor,
      targetType: "workspace",
      targetId: input.workspaceId,
    });
  }

  const [budget] = await db
    .select()
    .from(budgets)
    .where(eq(budgets.projectId, input.projectId))
    .limit(1);
  if (!budget) {
    return { rolled: false, budget: null };
  }
  return rollBudgetRow(db, {
    workspaceId: input.workspaceId,
    budget,
    actor: input.actor,
    targetType: "project",
    targetId: input.projectId,
  });
}

export async function getWorkspaceSpendSummary(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceSpendSummary | null> {
  const budget = await getWorkspaceBudgetRow(db, workspaceId);
  if (!budget) return null;

  const since =
    budget.period === "monthly" ? (budget.periodStartedAt ?? null) : null;
  const spentMicros = await sumWorkspaceUsage(
    db,
    workspaceId,
    SPENT_KINDS,
    since,
  );
  const reserved =
    (await sumWorkspaceUsage(db, workspaceId, ["estimate_reserve"], since)) -
    (await sumWorkspaceUsage(db, workspaceId, ["estimate_release"], since));
  const reservedMicros = Math.max(0, reserved);
  const availableMicros = Math.max(
    0,
    budget.capMicros - spentMicros - reservedMicros,
  );

  return {
    workspaceId,
    capMicros: budget.capMicros,
    spentMicros,
    reservedMicros,
    availableMicros,
    currency: budget.currency,
    budgetStatus: budget.status,
    period: budget.period,
    periodStartedAt: budget.periodStartedAt,
    budgetId: budget.id,
  };
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

  const wsSummary = await getWorkspaceSpendSummary(db, workspaceId);
  if (wsSummary) {
    const since = wsSummary.periodStartedAt;
    const projectSpentMicros = await sumUsage(
      db,
      projectId,
      SPENT_KINDS,
      since,
    );
    if (project.spentMicros !== projectSpentMicros) {
      await db
        .update(projects)
        .set({ spentMicros: projectSpentMicros, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    }
    return {
      projectId,
      workspaceId,
      capMicros: wsSummary.capMicros,
      spentMicros: wsSummary.spentMicros,
      reservedMicros: wsSummary.reservedMicros,
      availableMicros: wsSummary.availableMicros,
      currency: wsSummary.currency,
      budgetStatus: wsSummary.budgetStatus,
      pooled: true,
      projectSpentMicros,
    };
  }

  const [budget] = await db
    .select()
    .from(budgets)
    .where(eq(budgets.projectId, projectId))
    .limit(1);

  const capMicros = budget?.capMicros ?? project.maxBudgetMicros;
  const since =
    budget?.period === "monthly" ? (budget.periodStartedAt ?? null) : null;
  const spentMicros = await sumUsage(db, projectId, SPENT_KINDS, since);
  const reserved =
    (await sumUsage(db, projectId, ["estimate_reserve"], since)) -
    (await sumUsage(db, projectId, ["estimate_release"], since));
  const reservedMicros = Math.max(0, reserved);
  const availableMicros = Math.max(0, capMicros - spentMicros - reservedMicros);

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
    pooled: false,
    projectSpentMicros: spentMicros,
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
    throw new BudgetError(
      "paused",
      summary.pooled
        ? "Workspace budget is paused"
        : "Project budget is paused",
    );
  }
  if (estimateMicros > 0 && summary.availableMicros < estimateMicros) {
    throw new BudgetError(
      "insufficient",
      summary.pooled
        ? "Insufficient workspace budget for task estimate"
        : "Insufficient project budget for task estimate",
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

/** Net estimate still held for a task in the current budget period. */
export async function outstandingEstimateReserveForTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
  },
): Promise<number> {
  const budget = await getWorkspaceBudgetRow(db, input.workspaceId);
  const since =
    budget?.period === "monthly" ? (budget.periodStartedAt ?? null) : null;

  const [reservedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, input.workspaceId),
        eq(usageEvents.projectId, input.projectId),
        eq(usageEvents.taskId, input.taskId),
        eq(usageEvents.kind, "estimate_reserve"),
        since ? gte(usageEvents.createdAt, since) : undefined,
      ),
    );
  const [releasedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, input.workspaceId),
        eq(usageEvents.projectId, input.projectId),
        eq(usageEvents.taskId, input.taskId),
        eq(usageEvents.kind, "estimate_release"),
        since ? gte(usageEvents.createdAt, since) : undefined,
      ),
    );
  return Math.max(
    0,
    Number(reservedRow?.total ?? 0) - Number(releasedRow?.total ?? 0),
  );
}

/**
 * Release estimate held for a finished/cancelled run (capped by outstanding).
 * Safe to call multiple times — second call is a no-op when nothing remains.
 */
export async function releaseEstimateForRun(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    runId: string;
    amountMicros: number;
  },
): Promise<UsageEvent | null> {
  if (input.amountMicros <= 0) return null;
  const outstanding = await outstandingEstimateReserveForTask(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
  });
  const amount = Math.min(input.amountMicros, outstanding);
  if (amount <= 0) return null;
  return appendUsageEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runId: input.runId,
    kind: "estimate_release",
    costMicros: amount,
    quantity: "1",
    meta: { taskId: input.taskId, runId: input.runId },
  });
}

export type StaleReserveReconcileRow = {
  workspaceId: string;
  projectId: string;
  taskId: string;
  outstandingMicros: number;
  activeHoldMicros: number;
  releaseMicros: number;
};

export type StaleReserveReconcileResult = {
  dryRun: boolean;
  workspaceId: string | null;
  rows: StaleReserveReconcileRow[];
  releasedMicros: number;
  releasedEvents: number;
};

/**
 * Release estimate_reserve that is no longer covered by active runs
 * (QUEUED / RUNNING / VALIDATING / WAITING_CI). Keeps a hold equal to the
 * sum of estimatedCostMicros on those runs. One-shot ops / period cleanup.
 */
export async function reconcileStaleEstimateReserves(
  db: Database,
  input: {
    workspaceId?: string | null;
    dryRun?: boolean;
  } = {},
): Promise<StaleReserveReconcileResult> {
  const dryRun = input.dryRun !== false;
  const workspaceFilter = input.workspaceId?.trim() || null;

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(
      and(
        isNull(budgets.projectId),
        workspaceFilter ? eq(budgets.workspaceId, workspaceFilter) : undefined,
      ),
    );

  const rows: StaleReserveReconcileRow[] = [];
  let releasedMicros = 0;
  let releasedEvents = 0;

  for (const budget of budgetRows) {
    const since =
      budget.period === "monthly" ? (budget.periodStartedAt ?? null) : null;

    const reserveAgg = await db
      .select({
        projectId: usageEvents.projectId,
        taskId: usageEvents.taskId,
        reserved: sql<number>`coalesce(sum(case when ${usageEvents.kind} = 'estimate_reserve' then ${usageEvents.costMicros} else 0 end), 0)`,
        released: sql<number>`coalesce(sum(case when ${usageEvents.kind} = 'estimate_release' then ${usageEvents.costMicros} else 0 end), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.workspaceId, budget.workspaceId),
          inArray(usageEvents.kind, ["estimate_reserve", "estimate_release"]),
          since ? gte(usageEvents.createdAt, since) : undefined,
          sql`${usageEvents.taskId} is not null`,
        ),
      )
      .groupBy(usageEvents.projectId, usageEvents.taskId);

    for (const agg of reserveAgg) {
      if (!agg.taskId) continue;
      const outstanding = Math.max(
        0,
        Number(agg.reserved ?? 0) - Number(agg.released ?? 0),
      );
      if (outstanding <= 0) continue;

      const [activeHold] = await db
        .select({
          total: sql<number>`coalesce(sum(${agentRuns.estimatedCostMicros}), 0)`,
        })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.workspaceId, budget.workspaceId),
            eq(agentRuns.projectId, agg.projectId),
            eq(agentRuns.taskId, agg.taskId),
            inArray(agentRuns.status, [...ACTIVE_RESERVE_RUN_STATUSES]),
          ),
        );
      const activeHoldMicros = Math.max(0, Number(activeHold?.total ?? 0));
      const releaseMicros = Math.max(0, outstanding - activeHoldMicros);
      if (releaseMicros <= 0) continue;

      const row: StaleReserveReconcileRow = {
        workspaceId: budget.workspaceId,
        projectId: agg.projectId,
        taskId: agg.taskId,
        outstandingMicros: outstanding,
        activeHoldMicros,
        releaseMicros,
      };
      rows.push(row);

      if (!dryRun) {
        await appendUsageEvent(db, {
          workspaceId: budget.workspaceId,
          projectId: agg.projectId,
          taskId: agg.taskId,
          kind: "estimate_release",
          costMicros: releaseMicros,
          quantity: "1",
          meta: {
            reason: "reconcile_stale_estimate_reserves",
            outstandingBefore: outstanding,
            activeHoldMicros,
          },
        });
        await db.insert(auditEvents).values({
          id: crypto.randomUUID(),
          workspaceId: budget.workspaceId,
          actor: "script:reconcile-stale-reserves",
          action: "budget.estimate_release_reconcile",
          targetType: "task",
          targetId: agg.taskId,
          meta: JSON.stringify({
            projectId: agg.projectId,
            releaseMicros,
            outstandingBefore: outstanding,
            activeHoldMicros,
          }),
          createdAt: new Date(),
        });
        releasedMicros += releaseMicros;
        releasedEvents += 1;
      }
    }
  }

  if (dryRun) {
    releasedMicros = rows.reduce((s, r) => s + r.releaseMicros, 0);
  }

  return {
    dryRun,
    workspaceId: workspaceFilter,
    rows,
    releasedMicros,
    releasedEvents: dryRun ? 0 : releasedEvents,
  };
}
