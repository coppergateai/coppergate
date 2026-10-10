import Link from "next/link";
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
import { BriefPanel } from "./brief-panel";
import { BudgetPanel } from "./budget-panel";
import { DeliveryBoard } from "./delivery-board";
import { PlanPanel } from "./plan-panel";

type PageProps = { params: Promise<{ id: string; projectId: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id: workspaceId, projectId } = await params;
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

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <p style={{ margin: 0 }}>
        <Link
          href={`/workspaces/${workspaceId}/projects`}
          style={{ color: "#A3A3A3" }}
        >
          ← Projects
        </Link>
        {" · "}
        <Link
          href={`/workspaces/${workspaceId}/inbox`}
          style={{ color: "#A3A3A3" }}
        >
          Inbox
        </Link>
      </p>
      <h1
        style={{
          margin: "1.25rem 0 0.35rem",
          fontSize: "1.75rem",
          fontWeight: 600,
        }}
      >
        {row.project.name}
      </h1>
      <p style={{ margin: 0, color: "#A3A3A3" }}>
        {row.repository.baseRepoFullName} · {row.project.mode} ·{" "}
        {row.project.stack}
      </p>

      {showGuide ? (
        <OnboardingGuide
          title="Path to first PR"
          steps={[
            {
              id: "budget",
              title: "Set an active spend cap",
              detail: "Budget panel below — pause blocks the worker.",
              done: hasBudget,
            },
            {
              id: "brief",
              title: "Generate and approve a brief",
              detail: "Keep scope tiny for the first delivery.",
              done: hasApprovedBrief,
            },
            {
              id: "plan",
              title: "Generate a plan",
              detail: "One small task is enough for the smoke path.",
              done: hasPlan,
            },
            {
              id: "task",
              title: "Submit + approve a task",
              detail: "Requires autonomy ≥ L1 and a running worker.",
              done: hasQueuedOrBeyond,
            },
          ]}
        />
      ) : null}

      <BriefPanel
        workspaceId={workspaceId}
        projectId={projectId}
        initialBrief={initialBrief}
        isOwner={access.role === "owner"}
      />

      <PlanPanel
        workspaceId={workspaceId}
        projectId={projectId}
        initialPlan={initialPlan}
        hasApprovedBrief={hasApprovedBrief}
        isOwner={access.role === "owner"}
      />

      <DeliveryBoard
        workspaceId={workspaceId}
        projectId={projectId}
        tasks={boardTasks}
      />

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
        isOwner={access.role === "owner"}
      />
    </main>
  );
}
