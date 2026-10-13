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
import { SiteChrome } from "../../../../site-chrome";
import { ArenaPanel } from "./arena-panel";
import { IssuesPanel } from "./issues-panel";
import { MergePanel } from "./merge-panel";
import { BriefPanel } from "./brief-panel";
import { BudgetPanel } from "./budget-panel";
import { DeliveryBoard } from "./delivery-board";
import { PlanPanel } from "./plan-panel";
import styles from "./project-detail.module.css";

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
    <SiteChrome>
      <main className={styles.main}>
        <p className={styles.nav}>
          <Link
            href={`/workspaces/${workspaceId}/projects`}
            className={styles.navLink}
          >
            ← Projects
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href={`/workspaces/${workspaceId}/inbox`}
            className={styles.navLink}
          >
            Inbox
          </Link>
        </p>
        <p className={styles.eyebrow}>Project</p>
        <h1 className={styles.title}>{row.project.name}</h1>
        <p className={styles.lede}>
          {row.repository.baseRepoFullName} · {row.project.mode} ·{" "}
          {row.project.stack}
        </p>

        {showGuide ? (
          <div className={styles.path}>
            <OnboardingGuide
              compact
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
          isOwner={access.role === "owner"}
        />

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

        <IssuesPanel
          workspaceId={workspaceId}
          projectId={projectId}
          isOwner={access.role === "owner"}
        />

        <MergePanel
          workspaceId={workspaceId}
          projectId={projectId}
          initialMergeEnabled={row.project.mergeEnabled}
          autonomyLevel={row.project.autonomyLevel}
          isOwner={access.role === "owner"}
        />

        <ArenaPanel
          workspaceId={workspaceId}
          projectId={projectId}
          isOwner={access.role === "owner"}
        />
      </main>
    </SiteChrome>
  );
}
