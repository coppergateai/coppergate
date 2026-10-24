import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { listInboxApprovalsForWorkspace } from "./approvals.js";
import { getWorkspaceSpendSummary } from "./budgets.js";
import { listAuditEventsForWorkspace } from "./audit.js";
import { displayTaskTitle } from "./display-title.js";
import { getTaskEvidenceBundle } from "./evidence.js";
import { getWorkspaceConcurrency } from "./plan-policy.js";
import {
  classifyContenderRuntime,
  isLiveArenaStatus,
  listWorkspaceArenaSnapshot,
  type WorkspaceArenaProjectLane,
} from "./workspace-arena.js";
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
  | "budget_reserved"
  | "review_required"
  | "arena_failed"
  | "replan_failed"
  | "merge_blocked"
  | "concurrency";

export type MissionControlAttentionItem = {
  id: string;
  kind: MissionControlAttentionKind;
  title: string;
  detail: string;
  href: string;
  priority: "high" | "normal";
  /** Optional primary CTA label for the attention row. */
  ctaLabel?: string;
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
    /** REVIEW_REQUIRED deliveries waiting on Evidence Accept (not inbox gates). */
    needsEvidenceAccept: number;
    highPriorityApprovals: number;
    verifiedPrsThisMonth: number;
    budgetSpentMicros: number;
    budgetReservedMicros: number;
    budgetAvailableMicros: number;
    budgetCapMicros: number;
    budgetCurrency: string;
    budgetStatus: string | null;
    arenaRunning: number;
    arenaAwaitingCi: number;
    arenaNeedsAttention: number;
    arenaIdle: number;
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

function laneNeedsAttention(lane: WorkspaceArenaProjectLane): boolean {
  const arenaLive = isLiveArenaStatus(lane.arenaStatus);
  return lane.contenders.some(
    (c) =>
      classifyContenderRuntime(c.latestRun, c.budgetMicrosRemaining, {
        arenaLive,
        contenderStatus: c.status,
      }) === "needsAttention",
  );
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
    recentAudit,
    concurrency,
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
    listAuditEventsForWorkspace(db, workspaceId, { limit: 40 }),
    getWorkspaceConcurrency(db, workspaceId),
  ]);

  const activeRuns = activeRunRows.reduce((s, r) => s + Number(r.n), 0);
  const activeRunProjects = activeRunRows.length;
  const highPriorityApprovals = pendingApprovals.filter(
    (a) => a.targetType === "task",
  ).length;

  const attention: MissionControlAttentionItem[] = [];
  const overConcurrency =
    concurrency.inflight > concurrency.limits.maxConcurrentRuns;

  if (overConcurrency) {
    attention.push({
      id: "concurrency-over",
      kind: "concurrency",
      title: "Over plan concurrency",
      detail: `${concurrency.inflight} in flight · plan allows ${concurrency.limits.maxConcurrentRuns}. Pause Arena so the queue can drain — other alerts are secondary until then.`,
      href: `/workspaces/${workspaceId}/arena`,
      priority: "high",
      ctaLabel: "Pause Arena",
    });
  }

  for (const a of pendingApprovals.slice(0, 6)) {
    const label =
      displayTaskTitle(a.title?.trim()) || `${a.targetType} approval`;
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
      ctaLabel: "Open inbox",
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
  } else if (
    spend &&
    spend.capMicros > 0 &&
    spend.reservedMicros / spend.capMicros >= 0.5
  ) {
    const reservedUsd = (spend.reservedMicros / 1_000_000).toFixed(2);
    const availableUsd = (spend.availableMicros / 1_000_000).toFixed(2);
    attention.push({
      id: "budget-reserved",
      kind: "budget_reserved",
      title: "Large budget reservation held",
      detail: `$${reservedUsd} reserved · $${availableUsd} available`,
      href: `/workspaces/${workspaceId}/settings?tab=general`,
      priority: "normal",
    });
  }

  for (const t of reviewTasks) {
    if (attention.some((x) => x.id === `review-${t.id}`)) continue;
    const title = displayTaskTitle(t.title);
    const bundle = await getTaskEvidenceBundle(db, workspaceId, t.id);
    const acceptReady = bundle?.selected?.acceptReady === true;
    attention.push({
      id: `review-${t.id}`,
      kind: "review_required",
      title: acceptReady
        ? `Accept delivery · ${title}`
        : `Review gates · ${title}`,
      detail: acceptReady
        ? `${t.projectName} · Gates clear — Accept in Evidence`
        : `${t.projectName} · Evidence open — hard gates still blocking Accept`,
      href: `/workspaces/${workspaceId}/projects/${t.projectId}?tab=evidence`,
      priority: "high",
      ctaLabel: acceptReady ? "Accept in Evidence" : "Open Evidence",
    });
  }

  // When over concurrency, arena/replan/merge noise is mostly a symptom —
  // keep Mission Control focused on Pause + real human gates.
  if (!overConcurrency) {
    const failedLanes = arena.projects.filter(laneNeedsAttention).slice(0, 4);
    for (const lane of failedLanes) {
      const arenaLive = isLiveArenaStatus(lane.arenaStatus);
      const hotCount = lane.contenders.filter(
        (c) =>
          classifyContenderRuntime(c.latestRun, c.budgetMicrosRemaining, {
            arenaLive,
            contenderStatus: c.status,
          }) === "needsAttention",
      ).length;
      // Prefer agent count — lastRun can be RUNNING while a peer contender failed.
      const detail =
        hotCount > 0
          ? `${hotCount} agent${hotCount === 1 ? "" : "s"} need attention · Open Arena`
          : `Last run ${lane.lastRun?.status ?? "attention"} · Open Arena`;
      attention.push({
        id: `arena-${lane.projectId}`,
        kind: "arena_failed",
        title: `Arena needs attention · ${lane.projectName}`,
        detail,
        href: `/workspaces/${workspaceId}/arena?focus=${encodeURIComponent(lane.projectId)}`,
        priority: "high",
        ctaLabel: "Open Arena",
      });
    }

    const replanFails = recentAudit
      .filter((e) => e.action === "maintainer.replan_queue_failed")
      .slice(0, 2);
    for (const ev of replanFails) {
      let projectId: string | null = null;
      if (ev.meta) {
        try {
          const meta = JSON.parse(ev.meta) as { projectId?: string };
          projectId = typeof meta.projectId === "string" ? meta.projectId : null;
        } catch {
          projectId = null;
        }
      }
      const href = projectId
        ? `/workspaces/${workspaceId}/projects/${projectId}`
        : `/workspaces/${workspaceId}/activity`;
      attention.push({
        id: `replan-${ev.id}`,
        kind: "replan_failed",
        title: "Replan queue failed",
        detail: "Maintainer could not queue the next task",
        href,
        priority: "high",
      });
    }

    const mergeBlocked = recentAudit
      .filter((e) => e.action === "merge.blocked")
      .slice(0, 3);
    const seenMergeProjects = new Set<string>();
    for (const ev of mergeBlocked) {
      let projectId: string | null = null;
      let message: string | null = null;
      if (ev.meta) {
        try {
          const meta = JSON.parse(ev.meta) as {
            projectId?: string;
            message?: string;
            cta?: string;
          };
          projectId =
            typeof meta.projectId === "string" ? meta.projectId : null;
          message =
            (typeof meta.message === "string" && meta.message) ||
            (typeof meta.cta === "string" && meta.cta) ||
            null;
        } catch {
          projectId = null;
        }
      }
      const dedupeKey = projectId ?? ev.id;
      if (seenMergeProjects.has(dedupeKey)) continue;
      seenMergeProjects.add(dedupeKey);
      attention.push({
        id: `merge-blocked-${ev.id}`,
        kind: "merge_blocked",
        title: "Merge blocked",
        detail: message
          ? message.slice(0, 140)
          : "GitHub branch protection requires review — clear after fixing rights",
        href: projectId
          ? `/workspaces/${workspaceId}/projects/${projectId}?tab=configuration`
          : `/workspaces/${workspaceId}/activity`,
        priority: "high",
        ctaLabel: "Fix merge rights",
      });
    }
  }

  attention.sort((a, b) => {
    // Concurrency crisis always leads — one decision before triage noise.
    if (a.kind === "concurrency" && b.kind !== "concurrency") return -1;
    if (b.kind === "concurrency" && a.kind !== "concurrency") return 1;
    if (a.priority === b.priority) return 0;
    return a.priority === "high" ? -1 : 1;
  });

  // Dedupe identical in-flight titles for the executions strip
  const seenExecTitles = new Set<string>();
  const executions: MissionControlExecution[] = [];
  for (const t of activeTasks) {
    const plainTitle = displayTaskTitle(t.title);
    const dedupeKey = `${plainTitle}::${t.status}`;
    if (seenExecTitles.has(dedupeKey) && t.status === "QUEUED") {
      continue;
    }
    seenExecTitles.add(dedupeKey);
    executions.push({
      projectId: t.projectId,
      projectName: t.projectName,
      taskId: t.id,
      taskTitle: plainTitle || t.title,
      phase: phaseForStatus(t.status),
      status: t.status,
      href: `/workspaces/${workspaceId}/projects/${t.projectId}/tasks/${t.id}`,
    });
    if (executions.length >= 10) break;
  }

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
      needsEvidenceAccept: reviewTasks.length,
      highPriorityApprovals,
      verifiedPrsThisMonth: Number(verifiedRows[0]?.n ?? 0),
      budgetSpentMicros: spend?.spentMicros ?? 0,
      budgetReservedMicros: spend?.reservedMicros ?? 0,
      budgetAvailableMicros: spend?.availableMicros ?? 0,
      budgetCapMicros: spend?.capMicros ?? 0,
      budgetCurrency: spend?.currency ?? "USD",
      budgetStatus: spend?.budgetStatus ?? null,
      arenaRunning: arena.summary.running,
      arenaAwaitingCi: arena.summary.awaitingCi,
      arenaNeedsAttention: arena.summary.needsAttention,
      arenaIdle: arena.summary.idle,
    },
    attention: attention.slice(0, 10),
    executions: executions.slice(0, 10),
  };
}
