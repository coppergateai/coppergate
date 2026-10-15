import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getLatestBriefForProject,
  getProjectForWorkspace,
  getProjectPlan,
  getProjectSpendSummary,
  getWorkspaceForMember,
  parseClarifyingAnswers,
  parseJsonArray,
  serializeAllowedPaths,
  serializeTaskCriteria,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { db } from "@/lib/db";
import { ArenaPanel } from "./arena-panel";
import { IssuesPanel } from "./issues-panel";
import { MergePanel } from "./merge-panel";
import { BriefPanel } from "./brief-panel";
import { BudgetPanel } from "./budget-panel";
import { DeliveryBoard } from "./delivery-board";
import { PlanPanel } from "./plan-panel";
import {
  parseProjectTab,
  ProjectShell,
} from "./project-shell";
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
  const hasQueuedOrBeyond =
    plan?.milestones.some(({ tasks }) =>
      tasks.some(
        ({ task }) =>
          task.status !== "DRAFT" && task.status !== "READY_FOR_APPROVAL",
      ),
    ) ?? false;

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
    !hasApprovedBrief || !hasPlan || !hasBudget || !hasQueuedOrBeyond;

  const isOwner = access.role === "owner";
  const basePath = `/workspaces/${workspaceId}/projects/${projectId}`;

  return (
    <Suspense fallback={null}>
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
        initialTab={parseProjectTab(sp.tab)}
        overview={
          <>
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
                        "Pause blocks the worker from claiming new runs.",
                      href: hasBudget ? undefined : `${basePath}?tab=overview#budget`,
                      ctaLabel: "Go to budget",
                      done: hasBudget,
                    },
                    {
                      id: "brief",
                      title: "Generate and approve a brief",
                      detail: "Keep scope tiny for the first delivery.",
                      href: hasApprovedBrief
                        ? undefined
                        : `${basePath}?tab=overview#brief`,
                      ctaLabel: "Go to brief",
                      done: hasApprovedBrief,
                    },
                    {
                      id: "plan",
                      title: "Generate a plan",
                      detail: "One small task is enough for the smoke path.",
                      href: hasPlan
                        ? undefined
                        : `${basePath}?tab=delivery#plan`,
                      ctaLabel: "Go to plan",
                      done: hasPlan,
                    },
                    {
                      id: "task",
                      title: "Submit + approve a task",
                      detail:
                        "Requires autonomy ≥ L1 and a running worker.",
                      href: hasQueuedOrBeyond
                        ? undefined
                        : `${basePath}?tab=delivery`,
                      ctaLabel: "Open delivery",
                      done: hasQueuedOrBeyond,
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
            <BriefPanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialBrief={initialBrief}
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
            <IssuesPanel
              workspaceId={workspaceId}
              projectId={projectId}
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
