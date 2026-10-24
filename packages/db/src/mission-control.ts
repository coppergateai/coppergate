import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { listInboxApprovalsForWorkspace } from "./approvals.js";
import { getWorkspaceSpendSummary } from "./budgets.js";
import { listWorkspaceArenaSnapshot } from "./workspace-arena.js";
import { agentRuns, projects, tasks } from "./schema.js";

const ACTIVE_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
] as const;

const ACTIVE_TASK_STATUSES = [
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
  "IN_REVIEW",
] as const;

export type MissionControlAttentionKind =
  | "approval"
  | "budget_paused"
  | "review_required";

export type MissionControlAttentionItem = {
  id: string;
  kind: MissionControlAttentionKind;
  title: string;
  detail: string;
  href: string;
  priority: "high" | "normal";
};

export type MissionControlExecution = {
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  phase: string;
  status: string;
  href: string;
};

export type WorkspaceMissionControl = {
  workspaceId: string;
  workspaceName: string;
  metrics: {
    activeRuns: number;
    activeRunProjects: number;
    needsApproval: number;
    highPriorityApprovals: number;
    verifiedPrsThisMonth: number;
    budgetSpentMicros: number;
    budgetCapMicros: number;
    budgetCurrency: string;
    budgetStatus: string | null;
  };
  attention: MissionControlAttentionItem[];
  executions: MissionControlExecution[];
};

function phaseForStatus(status: string): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Implementation";
    case "VALIDATING":
      return "Validation";
    case "WAITING_CI":
      return "CI";
    case "IN_REVIEW":
      return "In review";
    case "REVIEW_REQUIRED":
      return "Review";
    default:
      return status;
  }
}

function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Aggregated Mission Control snapshot for a workspace overview.
 * Caller must already have verified membership.
 */
export async function getWorkspaceMissionControl(
  db: Database,
  workspaceId: string,
  workspaceName: string,
): Promise<WorkspaceMissionControl> {
  const monthStart = startOfUtcMonth();

  const [
    spend,
    pendingApprovals,
    activeRunRows,
    verifiedRows,
    reviewTasks,
    activeTasks,
    arena,
  ] = await Promise.all([
    getWorkspaceSpendSummary(db, workspaceId),
    listInboxApprovalsForWorkspace(db, workspaceId, { status: "pending" }),
    db
      .select({
        projectId: agentRuns.projectId,
        n: count(),
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, workspaceId),
          inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      )
      .groupBy(agentRuns.projectId),
    db
      .select({ n: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.status, ["ACCEPTED", "DONE"]),
          sql`${tasks.prUrl} is not null`,
          gte(tasks.updatedAt, monthStart),
        ),
      ),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
        projectName: projects.name,
        prUrl: tasks.prUrl,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.status, "REVIEW_REQUIRED"),
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(8),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        projectId: tasks.projectId,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.status, [...ACTIVE_TASK_STATUSES]),
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(12),
    listWorkspaceArenaSnapshot(db, workspaceId),
  ]);

  const activeRuns = activeRunRows.reduce((s, r) => s + Number(r.n), 0);
  const activeRunProjects = activeRunRows.length;
  const highPriorityApprovals = pendingApprovals.filter(
    (a) => a.targetType === "task",
  ).length;

  const attention: MissionControlAttentionItem[] = [];

  for (const a of pendingApprovals.slice(0, 6)) {
    const label = a.title?.trim() || `${a.targetType} approval`;
    attention.push({
      id: `approval-${a.id}`,
      kind: "approval",
      title:
        a.targetType === "task"
          ? `Review ${label}`
          : `Approve brief · ${label}`,
      detail: `${a.projectName} · Pending decision`,
      href: `/workspaces/${workspaceId}/inbox?a=${encodeURIComponent(a.id)}`,
      priority: a.targetType === "task" ? "high" : "normal",
    });
  }

  if (spend?.budgetStatus === "paused") {
    attention.push({
      id: "budget-paused",
      kind: "budget_paused",
      title: "Budget threshold reached",
      detail: "Workspace envelope paused · Execution frozen",
      href: `/workspaces/${workspaceId}/settings?tab=general`,
      priority: "high",
    });
  }

  for (const t of reviewTasks) {
    if (attention.some((x) => x.href.includes(t.id))) continue;
    attention.push({
      id: `review-${t.id}`,
      kind: "review_required",
      title: t.prUrl
        ? `Review delivery · ${t.title}`
        : `Review required · ${t.title}`,
      detail: `${t.projectName} · Evidence ready for Accept`,
      href: `/workspaces/${workspaceId}/projects/${t.projectId}/tasks/${t.id}`,
      priority: "high",
    });
  }

  attention.sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === "high" ? -1 : 1;
  });

  const executions: MissionControlExecution[] = activeTasks.map((t) => ({
    projectId: t.projectId,
    projectName: t.projectName,
    taskId: t.id,
    taskTitle: t.title,
    phase: phaseForStatus(t.status),
    status: t.status,
    href: `/workspaces/${workspaceId}/projects/${t.projectId}/tasks/${t.id}`,
  }));

  // Fall back to arena lanes when no in-flight tasks but arena is live
  if (executions.length === 0 && arena.status === "LIVE") {
    for (const lane of arena.projects) {
      if (lane.arenaStatus !== "RUNNING" && lane.arenaStatus !== "ARMED") {
        continue;
      }
      executions.push({
        projectId: lane.projectId,
        projectName: lane.projectName,
        taskId: null,
        taskTitle: lane.lastRun
          ? `Run ${lane.lastRun.status}`
          : "Arena armed",
        phase: lane.arenaStatus === "RUNNING" ? "Arena" : "Armed",
        status: lane.arenaStatus ?? "ARMED",
        href: `/workspaces/${workspaceId}/arena?focus=${encodeURIComponent(lane.projectId)}`,
      });
    }
  }

  return {
    workspaceId,
    workspaceName,
    metrics: {
      activeRuns,
      activeRunProjects,
      needsApproval: pendingApprovals.length,
      highPriorityApprovals,
      verifiedPrsThisMonth: Number(verifiedRows[0]?.n ?? 0),
      budgetSpentMicros: spend?.spentMicros ?? 0,
      budgetCapMicros: spend?.capMicros ?? 0,
      budgetCurrency: spend?.currency ?? "USD",
      budgetStatus: spend?.budgetStatus ?? null,
    },
    attention: attention.slice(0, 8),
    executions: executions.slice(0, 10),
  };
}
