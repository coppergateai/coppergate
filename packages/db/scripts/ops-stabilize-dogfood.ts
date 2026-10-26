/**
 * Stabilize dual-workspace dogfood (idempotent):
 * - Pause kprompt arenas + disable maintainer
 * - Cancel open kprompt runs / fail queued tasks; release orphan reserves
 * - Pin coppergate defaultN=2 (Community duel); cancel WAITING_CI run stuck on closed PR #1
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  closeDb,
  createDb,
  getProjectSpendSummary,
  listProjectsForWorkspace,
  outstandingEstimateReserveForTask,
  pauseArena,
  reconcileStaleEstimateReserves,
  releaseEstimateForRun,
  requestCancelRun,
  updateMaintainerPolicy,
} from "../src/index.ts";
import { agentRuns, arenas, budgets, tasks, usageEvents } from "../src/schema.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const KP = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";
const CG_PROJECT = "2ea4afe3-4521-4cec-a062-a42c686e1bb0";
const STALE_RUN = "14e43af6-970c-4d53-9330-2d02f2c00264";
const actor = "script:ops-stabilize-dogfood";

const HOT = ["QUEUED", "RUNNING", "VALIDATING", "WAITING_CI"] as const;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

try {
  // --- kprompt: pause arenas + maintainer off ---
  const kpArenas = await db
    .select()
    .from(arenas)
    .where(eq(arenas.workspaceId, KP));
  let pausedCount = 0;
  for (const a of kpArenas) {
    if (a.status === "RUNNING" || a.status === "ARMED") {
      await pauseArena(db, { workspaceId: KP, arenaId: a.id, actor });
      pausedCount += 1;
    }
  }

  const kpProjects = await listProjectsForWorkspace(db, KP);
  const maintainerOff: string[] = [];
  for (const p of kpProjects) {
    if (p.project.maintainerEnabled) {
      await updateMaintainerPolicy(db, {
        workspaceId: KP,
        projectId: p.project.id,
        actor,
        patch: { enabled: false },
      });
      maintainerOff.push(p.project.name);
    }
  }

  const openRuns = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.workspaceId, KP), inArray(agentRuns.status, [...HOT])));
  let cancelledRuns = 0;
  for (const r of openRuns) {
    try {
      await requestCancelRun(db, { workspaceId: KP, runId: r.id, actor });
      cancelledRuns += 1;
    } catch {
      /* already terminal */
    }
  }

  const failedTasks = await db
    .update(tasks)
    .set({ status: "FAILED", updatedAt: new Date() })
    .where(
      and(
        eq(tasks.workspaceId, KP),
        inArray(tasks.status, [
          "QUEUED",
          "RUNNING",
          "VALIDATING",
          "WAITING_CI",
          "READY_FOR_APPROVAL",
        ]),
      ),
    )
    .returning({ id: tasks.id });

  // Release orphan estimate holds on non-hot tasks.
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
        eq(usageEvents.workspaceId, KP),
        inArray(usageEvents.kind, ["estimate_reserve", "estimate_release"]),
        sql`${usageEvents.taskId} is not null`,
      ),
    )
    .groupBy(usageEvents.projectId, usageEvents.taskId);

  let orphanReleased = 0;
  let orphanRows = 0;
  for (const agg of reserveAgg) {
    if (!agg.taskId || !agg.projectId) continue;
    const outstanding = Math.max(
      0,
      Number(agg.reserved) - Number(agg.released),
    );
    if (outstanding <= 0) continue;
    const [t] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, agg.taskId))
      .limit(1);
    if (t && (HOT as readonly string[]).includes(t.status)) continue;
    await releaseEstimateForRun(db, {
      workspaceId: KP,
      projectId: agg.projectId,
      taskId: agg.taskId,
      runId: crypto.randomUUID(),
      amountMicros: outstanding,
    });
    orphanReleased += outstanding;
    orphanRows += 1;
  }

  const reconcile = await reconcileStaleEstimateReserves(db, {
    workspaceId: KP,
    dryRun: false,
  });

  const primary =
    kpProjects.find((p) => p.project.name === "kprompt") ?? kpProjects[0];
  const spend = primary
    ? await getProjectSpendSummary(db, KP, primary.project.id)
    : null;

  // --- coppergate ---
  await db
    .update(arenas)
    .set({ defaultContenderN: 2, updatedAt: new Date() })
    .where(eq(arenas.workspaceId, CG));

  await updateMaintainerPolicy(db, {
    workspaceId: CG,
    projectId: CG_PROJECT,
    actor,
    patch: {
      enabled: true,
      maxTournamentN: 2,
      continuousBacklog: true,
      architectureRepo: "coppergateai/coppergate-architecture",
      architecturePaths: "docs/OPEN_PROGRAM.md",
      monthlyBudgetMicros: 8_000_000,
      communityScout: false,
      communityReplies: false,
      autoRelease: false,
    },
  });

  await db
    .update(budgets)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(eq(budgets.workspaceId, CG), eq(budgets.projectId, CG_PROJECT)),
    );

  let staleCancel: Record<string, unknown> | null = null;
  const [stale] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, STALE_RUN))
    .limit(1);
  if (stale && (HOT as readonly string[]).includes(stale.status)) {
    const cancelled = await requestCancelRun(db, {
      workspaceId: CG,
      runId: stale.id,
      actor,
    });
    if (stale.taskId) {
      await db
        .update(tasks)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(
          and(
            eq(tasks.id, stale.taskId),
            inArray(tasks.status, [
              "WAITING_CI",
              "QUEUED",
              "RUNNING",
              "VALIDATING",
              "REVIEW_REQUIRED",
            ]),
          ),
        );
    }
    staleCancel = {
      runId: stale.id,
      from: stale.status,
      after: cancelled.status,
      prUrl: stale.prUrl,
    };
  } else {
    staleCancel = {
      runId: STALE_RUN,
      skipped: true,
      status: stale?.status ?? "missing",
    };
  }

  const kpArenaAfter = await db
    .select({
      status: arenas.status,
      n: sql<number>`count(*)::int`,
    })
    .from(arenas)
    .where(eq(arenas.workspaceId, KP))
    .groupBy(arenas.status);
  const cgArena = await db
    .select()
    .from(arenas)
    .where(eq(arenas.workspaceId, CG));
  const reviewHolds: Array<{ id: string; outstanding: number; status: string }> =
    [];
  const reviewTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, KP),
        inArray(tasks.status, ["REVIEW_REQUIRED", "ACCEPTED"]),
      ),
    )
    .limit(20);
  for (const t of reviewTasks) {
    const o = await outstandingEstimateReserveForTask(db, {
      workspaceId: KP,
      projectId: t.projectId,
      taskId: t.id,
    });
    if (o > 0) {
      reviewHolds.push({
        id: t.id.slice(0, 8),
        outstanding: o,
        status: t.status,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        kprompt: {
          pausedCount,
          arenaStatusAfter: kpArenaAfter,
          maintainerOff,
          cancelledRuns,
          failedTasks: failedTasks.length,
          orphanRows,
          orphanReleasedMicros: orphanReleased,
          reconcile: {
            rows: reconcile.rows.length,
            releasedMicros: reconcile.releasedMicros,
          },
          spend: spend
            ? {
                availableMicros: spend.availableMicros,
                reservedMicros: spend.reservedMicros,
                spentMicros: spend.spentMicros,
                budgetStatus: spend.budgetStatus,
              }
            : null,
          reviewHoldsLeft: reviewHolds,
        },
        coppergate: {
          defaultN: cgArena.map((a) => ({
            status: a.status,
            defaultN: a.defaultContenderN,
          })),
          staleCancel,
        },
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
