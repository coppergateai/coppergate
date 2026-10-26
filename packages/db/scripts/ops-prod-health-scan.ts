/**
 * Production health scan for coppergate + kprompt dogfood workspaces.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  closeDb,
  createDb,
  extractArchitectureIdFromTitle,
  getProjectSpendSummary,
  outstandingEstimateReserveForTask,
} from "../src/index.ts";
import {
  agentRuns,
  arenas,
  budgets,
  projects,
  tasks,
  workspaces,
} from "../src/schema.ts";

const HOT = ["QUEUED", "RUNNING", "VALIDATING", "WAITING_CI"] as const;
const OPEN_TASK = [
  "DRAFT",
  "READY_FOR_APPROVAL",
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
  "REVIEW_REQUIRED",
  "BLOCKED",
] as const;

const IDS = {
  coppergate: "2c894510-810e-46cc-8ff0-652f63870639",
  kprompt: "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a",
} as const;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });

async function scanWorkspace(label: string, workspaceId: string) {
  const [ws] = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) return { label, error: "workspace_not_found", workspaceId };

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId));

  const arenaRows = await db
    .select()
    .from(arenas)
    .where(eq(arenas.workspaceId, workspaceId));

  const hotRuns = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      taskId: agentRuns.taskId,
      projectId: agentRuns.projectId,
      prNumber: agentRuns.prNumber,
      prUrl: agentRuns.prUrl,
      errorCode: agentRuns.errorCode,
      leaseUntil: agentRuns.leaseUntil,
      leaseOwner: agentRuns.leaseOwner,
      updatedAt: agentRuns.updatedAt,
      actualCostMicros: agentRuns.actualCostMicros,
      estimatedCostMicros: agentRuns.estimatedCostMicros,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        inArray(agentRuns.status, [...HOT]),
      ),
    )
    .orderBy(desc(agentRuns.updatedAt))
    .limit(50);

  const openTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
      prUrl: tasks.prUrl,
      attemptCount: tasks.attemptCount,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.status, [...OPEN_TASK]),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(50);

  const [budget] = await db
    .select()
    .from(budgets)
    .where(
      and(eq(budgets.workspaceId, workspaceId), eq(budgets.period, "monthly")),
    )
    .limit(1);

  const orphanReserves: Array<{
    taskId: string;
    title: string;
    status: string;
    reservedMicros: number;
  }> = [];
  for (const t of openTasks) {
    const reserved = await outstandingEstimateReserveForTask(db, {
      workspaceId,
      projectId: t.projectId,
      taskId: t.id,
    });
    if (reserved > 0 && !["QUEUED", "RUNNING", "VALIDATING", "WAITING_CI"].includes(t.status)) {
      orphanReserves.push({
        taskId: t.id,
        title: t.title.slice(0, 80),
        status: t.status,
        reservedMicros: reserved,
      });
    }
  }

  // Also check DONE/FAILED/CANCELLED with leftover reserves (sample recent)
  const recentClosed = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.status, ["DONE", "FAILED", "CANCELLED", "ACCEPTED"]),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(30);
  for (const t of recentClosed) {
    const reserved = await outstandingEstimateReserveForTask(db, {
      workspaceId,
      projectId: t.projectId,
      taskId: t.id,
    });
    if (reserved > 0) {
      orphanReserves.push({
        taskId: t.id,
        title: t.title.slice(0, 80),
        status: t.status,
        reservedMicros: reserved,
      });
    }
  }

  const projectSummaries = [];
  for (const p of projectRows) {
    let spend = null;
    try {
      spend = await getProjectSpendSummary(db, workspaceId, p.id);
    } catch (err) {
      spend = { error: err instanceof Error ? err.message : String(err) };
    }
    const policy = (() => {
      try {
        return JSON.parse(p.maintainerPolicyJson ?? "{}") as Record<
          string,
          unknown
        >;
      } catch {
        return {};
      }
    })();
    const arena = arenaRows.find((a) => a.projectId === p.id);
    projectSummaries.push({
      id: p.id,
      name: p.name,
      maintainerEnabled: p.maintainerEnabled,
      architectureRepo: policy.architectureRepo ?? null,
      continuousBacklog: policy.continuousBacklog ?? null,
      autoMerge: policy.autoMerge ?? null,
      arenaStatus: arena?.status ?? null,
      defaultContenderN: arena?.defaultContenderN ?? null,
      spend,
    });
  }

  const issues: string[] = [];
  for (const a of arenaRows) {
    if (label === "kprompt" && (a.status === "RUNNING" || a.status === "ARMED")) {
      issues.push(`kprompt arena ${a.id.slice(0, 8)} is ${a.status} (expected PAUSED)`);
    }
  }
  if (label === "kprompt") {
    const enabled = projectRows.filter((p) => p.maintainerEnabled);
    if (enabled.length) {
      issues.push(
        `kprompt maintainer enabled on: ${enabled.map((p) => p.name).join(", ")}`,
      );
    }
  }
  for (const r of hotRuns) {
    const staleMs = Date.now() - new Date(r.updatedAt).getTime();
    if (r.status === "RUNNING" && r.leaseUntil && new Date(r.leaseUntil).getTime() < Date.now()) {
      issues.push(`expired lease RUNNING ${r.id.slice(0, 8)} project=${r.projectId.slice(0, 8)}`);
    }
    if (staleMs > 6 * 60 * 60_000) {
      issues.push(
        `hot run stale>${Math.round(staleMs / 3600000)}h ${r.status} ${r.id.slice(0, 8)}`,
      );
    }
  }
  if (orphanReserves.length) {
    issues.push(`orphan reserves: ${orphanReserves.length}`);
  }
  if (label === "coppergate") {
    const live = arenaRows.filter((a) => a.status === "RUNNING" || a.status === "ARMED");
    const nBad = live.filter((a) => (a.defaultContenderN ?? 1) > 1);
    if (nBad.length) {
      issues.push(
        `coppergate fan-out N>1 on ${nBad.map((a) => a.id.slice(0, 8)).join(",")}`,
      );
    }
  }

  return {
    label,
    workspace: ws,
    budget: budget
      ? {
          capMicros: budget.capMicros,
          spentMicros: budget.spentMicros,
          softAlertMicros: budget.softAlertMicros,
          pausedAt: budget.pausedAt,
        }
      : null,
    arenas: arenaRows.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      status: a.status,
      defaultContenderN: a.defaultContenderN,
      minHuman: a.minHuman,
    })),
    projects: projectSummaries,
    hotRuns: hotRuns.map((r) => ({
      ...r,
      ageMin: Math.round((Date.now() - new Date(r.updatedAt).getTime()) / 60000),
    })),
    openTasks: openTasks.map((t) => ({
      ...t,
      openId: extractArchitectureIdFromTitle(t.title),
      ageMin: Math.round((Date.now() - new Date(t.updatedAt).getTime()) / 60000),
    })),
    orphanReserves,
    issues,
  };
}

try {
  const coppergate = await scanWorkspace("coppergate", IDS.coppergate);
  const kprompt = await scanWorkspace("kprompt", IDS.kprompt);
  console.log(
    JSON.stringify(
      {
        scannedAt: new Date().toISOString(),
        coppergate,
        kprompt,
        needsAttention: [
          ...((coppergate as { issues?: string[] }).issues ?? []),
          ...((kprompt as { issues?: string[] }).issues ?? []),
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
