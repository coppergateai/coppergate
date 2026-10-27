/**
 * Stabilize dual dogfood now:
 * - kprompt: Pause all arenas, maintainer off, cancel hot runs, fail stale VALIDATING
 * - coppergate: keep N=1, resume primary arena if paused (self-pilot active)
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  closeDb,
  createDb,
  pauseArena,
  releaseEstimateForRun,
  requestCancelRun,
  resumeArena,
  updateMaintainerPolicy,
} from "../src/index.ts";
import { agentRuns, arenas, projects, tasks } from "../src/schema.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const KP = "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a";
const CG_PRIMARY = "2ea4afe3-4521-4cec-a062-a42c686e1bb0";
const actor = "script:ops-prod-stabilize-now";
const HOT = ["QUEUED", "RUNNING", "VALIDATING", "WAITING_CI"] as const;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

async function cancelHot(workspaceId: string) {
  const runs = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        inArray(agentRuns.status, [...HOT]),
      ),
    );
  let cancelled = 0;
  let released = 0;
  for (const run of runs) {
    try {
      await requestCancelRun(db, {
        workspaceId,
        runId: run.id,
        actor,
      });
      cancelled += 1;
    } catch {
      // Fall through to hard-fail if cancel rejects
      await db
        .update(agentRuns)
        .set({
          status: "FAILED",
          errorCode: "ops_stabilize",
          errorMessage: "Stabilized — cancelled stale/hot run",
          leaseOwner: null,
          leaseUntil: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id));
      cancelled += 1;
    }
    try {
      await releaseEstimateForRun(db, {
        workspaceId,
        projectId: run.projectId,
        taskId: run.taskId,
        runId: run.id,
        amountMicros: run.estimatedCostMicros || 0,
      });
      released += 1;
    } catch {
      /* ignore */
    }
  }

  // Fail open tasks that were QUEUED/RUNNING/VALIDATING/WAITING_CI
  const openHotTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.status, [...HOT]),
      ),
    );
  let tasksFailed = 0;
  for (const t of openHotTasks) {
    await db
      .update(tasks)
      .set({
        status: "FAILED",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, t.id));
    tasksFailed += 1;
  }

  return { runs: runs.length, cancelled, released, tasksFailed };
}

try {
  const report: Record<string, unknown> = { at: new Date().toISOString() };

  // --- kprompt ---
  const kpArenas = await db.select().from(arenas).where(eq(arenas.workspaceId, KP));
  let kpPaused = 0;
  for (const a of kpArenas) {
    if (a.status !== "PAUSED" && a.status !== "KILLED") {
      await pauseArena(db, { workspaceId: KP, arenaId: a.id, actor });
      kpPaused += 1;
    }
  }
  const kpProjects = await db.select().from(projects).where(eq(projects.workspaceId, KP));
  let kpMaintainerOff = 0;
  for (const p of kpProjects) {
    if (p.maintainerEnabled) {
      await updateMaintainerPolicy(db, {
        workspaceId: KP,
        projectId: p.id,
        actor,
        patch: { enabled: false, continuousBacklog: false, autoQueueReplanTasks: false },
      });
      kpMaintainerOff += 1;
    }
  }
  const kpCancel = await cancelHot(KP);
  report.kprompt = {
    arenasPaused: kpPaused,
    maintainerDisabled: kpMaintainerOff,
    ...kpCancel,
    arenaStatuses: (
      await db.select({ id: arenas.id, status: arenas.status, n: arenas.defaultContenderN }).from(arenas).where(eq(arenas.workspaceId, KP))
    ).map((a) => ({ id: a.id.slice(0, 8), status: a.status, n: a.n })),
  };

  // --- coppergate ---
  // Self-pilot: N=1 fan-out (not duel) so one machine can finish real TS validation.
  const cgArenas = await db.select().from(arenas).where(eq(arenas.workspaceId, CG));
  for (const a of cgArenas) {
    if (a.defaultContenderN !== 1) {
      await db
        .update(arenas)
        .set({ defaultContenderN: 1, updatedAt: new Date() })
        .where(eq(arenas.id, a.id));
    }
  }
  // Pin architecture + lean maintainer on primary; resume for self-pilot
  await updateMaintainerPolicy(db, {
    workspaceId: CG,
    projectId: CG_PRIMARY,
    actor,
    patch: {
      enabled: true,
      continuousBacklog: true,
      autoQueueReplanTasks: true,
      maxTournamentN: 1,
      architectureRepo: "coppergateai/coppergate-architecture",
      architecturePaths: "docs/OPEN_PROGRAM.md",
      monthlyBudgetMicros: 8_000_000,
      // Prefer TypeScript product paths; reject phantom Go thrash.
      pathAllowlist: ["apps/**", "packages/**", "docs/**", "scripts/**", "*.md"],
    },
  });
  const [primaryArena] = cgArenas.filter((a) => a.projectId === CG_PRIMARY);
  let cgResumed = false;
  if (primaryArena && (primaryArena.status === "PAUSED" || primaryArena.status === "ARMED")) {
    await resumeArena(db, {
      workspaceId: CG,
      arenaId: primaryArena.id,
      actor,
    });
    cgResumed = true;
  }
  report.coppergate = {
    pinnedN1: true,
    resumedPrimary: cgResumed,
    primaryArenaAfter: (
      await db
        .select({ status: arenas.status, n: arenas.defaultContenderN })
        .from(arenas)
        .where(eq(arenas.projectId, CG_PRIMARY))
        .limit(1)
    )[0] ?? null,
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await closeDb(db);
}
