import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getLatestBriefForProject,
  getProjectForWorkspace,
  getProjectPlan,
  getProjectSpendSummary,
  getWorkspaceForMember,
  listPendingApprovalsForWorkspace,
  parseClarifyingAnswers,
  parseJsonArray,
  serializeAllowedPaths,
  serializeTaskCriteria,
} from "@coppergate/db";
import { SkeletonStack } from "@/components/app/ui";
import { currentUser } from "@/lib/auth";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { db } from "@/lib/db";
import { ArenaPanel } from "./arena-panel";
import { CostExplorerStrip } from "./cost-explorer";
import { IssuesPanel } from "./issues-panel";
import { MergePanel } from "./merge-panel";
import { BriefPanel } from "./brief-panel";
import { BudgetPanel } from "./budget-panel";
import { DeliveryBoard } from "./delivery-board";
import { MultiRepoPanel } from "./multi-repo-panel";
import { PlanPanel } from "./plan-panel";
import { PolicyPresetsPanel } from "./policy-presets";
import { ProjectShell } from "./project-shell";
import { parseProjectTab } from "./project-tabs";
import styles from "./project-detail.module.css";

type PageProps = {
  params: Promise<{ id: string; projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id: workspaceId, projectId } = await params;
  const sp = await searchParams;
  const access = await getWorkspaceForMember(db, workspaceId, user.id);
  if (!access) {
    notFound();
  }

  const row = await getProjectForWorkspace(db, workspaceId, projectId);
  if (!row) {
    notFound();
  }

  const latest = await getLatestBriefForProject(db, workspaceId, projectId);
  const initialBrief = latest
    ? {
        id: latest.id,
        revision: latest.revision,
        status: latest.status,
        title: latest.title,
        targetUser: latest.targetUser,
        problem: latest.problem,
        scope: latest.scope,
        nonGoals: latest.nonGoals,
        acceptanceCriteria: parseJsonArray(latest.acceptanceCriteria),
        rawIdea: latest.rawIdea,
        clarifyingAnswers: parseClarifyingAnswers(latest.clarifyingAnswers),
      }
    : null;

  const plan = await getProjectPlan(db, workspaceId, projectId);
  const initialPlan = plan
    ? {
        briefId: plan.briefId,
        dependencyCount: plan.dependencies.length,
        milestones: plan.milestones.map(({ milestone, tasks }) => ({
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          sequence: milestone.sequence,
          status: milestone.status,
          estimatedCostMicros: milestone.estimatedCostMicros,
          tasks: tasks.map(({ task, dependsOnTaskIds }) => ({
            id: task.id,
            title: task.title,
            goal: task.goal,
            scope: task.scope,
            status: task.status,
            estimateMicros: task.estimateMicros,
            estimateComplexity: task.estimateComplexity,
            acceptanceCriteria: serializeTaskCriteria(task),
            allowedPaths: serializeAllowedPaths(task),
            dependsOnTaskIds,
          })),
        })),
      }
    : null;

  const hasApprovedBrief = !!row.project.currentBriefId;
  const usage = await getProjectSpendSummary(db, workspaceId, projectId);
  const hasBudget = usage.capMicros > 0 && usage.budgetStatus === "active";
  const hasPlan = !!plan && plan.milestones.some((m) => m.tasks.length > 0);
  const hasIssueTask =
    plan?.milestones.some(({ tasks }) =>
      tasks.some(({ task }) => task.githubIssueNumber != null),
    ) ?? false;
  const hasQueuedOrBeyond =
    plan?.milestones.some(({ tasks }) =>
      tasks.some(
        ({ task }) =>
          task.status !== "DRAFT" && task.status !== "READY_FOR_APPROVAL",
      ),
    ) ?? false;
  const hasAcceptedPr =
    plan?.milestones.some(({ tasks }) =>
      tasks.some(
        ({ task }) =>
          (task.status === "ACCEPTED" || task.status === "DONE") &&
          !!task.prUrl,
      ),
    ) ?? false;
  /** Wedge (D14): issue path OR classic brief+plan both unlock first PR. */
  const wedgeReady = hasIssueTask || (hasApprovedBrief && hasPlan);

  const boardTasks =
    plan?.milestones.flatMap(({ milestone, tasks }) =>
      tasks.map(({ task }) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        estimateMicros: task.estimateMicros,
        estimateComplexity: task.estimateComplexity,
        milestoneTitle: milestone.title,
      })),
    ) ?? [];

  const showGuide =
    !hasBudget || !wedgeReady || !hasQueuedOrBeyond || !hasAcceptedPr;

  const isOwner = access.role === "owner";
  const basePath = `/workspaces/${workspaceId}/projects/${projectId}`;
  const pendingAll = await listPendingApprovalsForWorkspace(db, workspaceId);
  const pendingApprovals = pendingAll.filter(
    (a) => a.projectId === projectId,
  ).length;
  const lastRunStatus =
    boardTasks.find((t) =>
      ["QUEUED", "RUNNING", "WAITING_CI", "IN_REVIEW", "FAILED", "DONE"].includes(
        t.status,
      ),
    )?.status ?? null;

  const stackHint =
    row.project.stack === "go"
      ? "Go tip: keep the first task to one package and a small test."
      : row.project.stack === "python"
        ? "Python tip: scope the first task to one module + pytest."
        : row.project.stack === "node"
          ? "Node tip: one route or script change is enough for the smoke path."
          : row.project.stack !== "nextjs_ts"
            ? "Best-effort agent on this stack — keep the first task tiny."
            : null;

  return (
    <Suspense fallback={<ProjectPageSkeleton />}>
      <ProjectShell
        workspaceId={workspaceId}
        projectId={projectId}
        name={row.project.name}
        repoFullName={row.repository.baseRepoFullName}
        mode={row.project.mode}
        stack={row.project.stack}
        autonomyLevel={row.project.autonomyLevel}
        budgetStatus={usage.budgetStatus}
        capMicros={usage.capMicros}
        currency={usage.currency}
        taskCount={boardTasks.length}
        pendingApprovals={pendingApprovals}
        lastRunStatus={lastRunStatus}
        initialTab={parseProjectTab(sp.tab)}
        overview={
          <>
            {stackHint ? (
              <p className={styles.stackHint}>{stackHint}</p>
            ) : null}
            {showGuide ? (
              <div className={styles.path}>
                <OnboardingGuide
                  compact
                  title="Path to first PR"
                  steps={[
                    {
                      id: "budget",
                      title: "Set an active spend cap",
                      detail:
                        "Hard cap is selection pressure — pause blocks new runs.",
                      href: hasBudget
                        ? undefined
                        : `${basePath}?tab=overview#budget`,
                      ctaLabel: "Go to budget",
                      done: hasBudget,
                    },
                    {
                      id: "issue",
                      title: "Import → queue a GitHub issue",
                      detail:
                        "Primary wedge: Issues panel → Import → queue (one small open issue). PR will include Closes #N.",
                      href: hasIssueTask
                        ? undefined
                        : `${basePath}?tab=overview#issues`,
                      ctaLabel: "Open issues",
                      done: hasIssueTask || hasQueuedOrBeyond,
                    },
                    {
                      id: "task",
                      title: "Wait for the worker PR",
                      detail:
                        "Autonomy ≥ L1. Hosted worker claims the queue; stay on the task until REVIEW_REQUIRED.",
                      href: hasQueuedOrBeyond
                        ? undefined
                        : `${basePath}?tab=delivery`,
                      ctaLabel: "Open delivery",
                      done: hasQueuedOrBeyond,
                    },
                    {
                      id: "review",
                      title: "Review cost, diff, and CI — then Accept",
                      detail:
                        "Accept stays closed while CI is pending or failed. Recovery: /docs/recovery.",
                      href: hasAcceptedPr
                        ? undefined
                        : `${basePath}?tab=delivery`,
                      ctaLabel: "Open delivery",
                      done: hasAcceptedPr,
                    },
                  ]}
                />
              </div>
            ) : null}
            <BudgetPanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialUsage={{
                capMicros: usage.capMicros,
                spentMicros: usage.spentMicros,
                reservedMicros: usage.reservedMicros,
                availableMicros: usage.availableMicros,
                currency: usage.currency,
                budgetStatus: usage.budgetStatus,
              }}
              isOwner={isOwner}
            />
            <CostExplorerStrip
              workspaceId={workspaceId}
              projectId={projectId}
            />
            <BriefPanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialBrief={initialBrief}
              isOwner={isOwner}
            />
            <IssuesPanel
              workspaceId={workspaceId}
              projectId={projectId}
              isOwner={isOwner}
            />
          </>
        }
        delivery={
          <>
            <PlanPanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialPlan={initialPlan}
              hasApprovedBrief={hasApprovedBrief}
              isOwner={isOwner}
            />
            <DeliveryBoard
              workspaceId={workspaceId}
              projectId={projectId}
              tasks={boardTasks}
            />
          </>
        }
        arena={
          <ArenaPanel
            workspaceId={workspaceId}
            projectId={projectId}
            isOwner={isOwner}
          />
        }
        more={
          <>
            <MultiRepoPanel
              workspaceId={workspaceId}
              projectId={projectId}
              isOwner={isOwner}
            />
            <PolicyPresetsPanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialAutonomy={row.project.autonomyLevel}
              initialMergeEnabled={row.project.mergeEnabled}
              isOwner={isOwner}
            />
            <MergePanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialMergeEnabled={row.project.mergeEnabled}
              autonomyLevel={row.project.autonomyLevel}
              isOwner={isOwner}
            />
          </>
        }
      />
    </Suspense>
  );
}

function ProjectPageSkeleton() {
  return (
    <main style={{ padding: "1.25rem 1.15rem" }}>
      <SkeletonStack rows={4} />
    </main>
  );
}
