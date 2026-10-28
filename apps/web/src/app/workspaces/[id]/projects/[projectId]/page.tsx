import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getArenaForProject,
  getLatestBriefForProject,
  getProjectForWorkspace,
  getProjectPlan,
  computeIssueWedgeNextStep,
  getProjectSpendSummary,
  getWorkspaceForMember,
  issueWedgeHonestyForProject,
  listPendingApprovalsForWorkspace,
  parseClarifyingAnswers,
  parseJsonArray,
  serializeAllowedPaths,
  serializeTaskCriteria,
} from "@coppergate/db";
import { SkeletonStack } from "@/components/app/ui";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ArenaPanel } from "./arena-panel";
import { CostExplorerStrip } from "./cost-explorer";
import { EvidencePanel } from "./evidence-panel";
import { IssuesPanel } from "./issues-panel";
import { PullsPanel } from "./pulls-panel";
import { MergePanel } from "./merge-panel";
import { MaintainerPanel } from "./maintainer-panel";
import { BriefPanel } from "./brief-panel";
import { BudgetPanel } from "./budget-panel";
import { DeliveryBoard } from "./delivery-board";
import { MultiRepoPanel } from "./multi-repo-panel";
import {
  NextActionStrip,
  type NextActionStep,
} from "./next-action-strip";
import { PlanPanel } from "./plan-panel";
import { PolicyPresetsPanel } from "./policy-presets";
import { ProjectShell } from "./project-shell";
import { parseProjectTab } from "./project-tabs";
import styles from "./project-detail.module.css";

type PageProps = {
  params: Promise<{ id: string; projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Project" };
  const { id, projectId } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) return { title: "Project" };
  const bound = await getProjectForWorkspace(db, id, projectId);
  return { title: bound?.project.name ?? "Project" };
}

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

  const isOwner = access.role === "owner";
  const arenaRow = await getArenaForProject(db, { workspaceId, projectId });
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

  const reviewTask = boardTasks.find((t) => t.status === "REVIEW_REQUIRED");
  const hasWaitingCi = boardTasks.some((t) => t.status === "WAITING_CI");
  const hasReviewRequired = Boolean(reviewTask);
  const wedgeHonesty = issueWedgeHonestyForProject({
    mode: row.project.mode,
    maintainerPolicyJson: row.project.maintainerPolicyJson,
  });
  const hasIssueLinked =
    plan?.milestones.some(({ tasks }) =>
      tasks.some(({ task }) => task.githubIssueNumber != null),
    ) ?? false;

  // Human Accept gates live on Evidence — don't double-count on Delivery.
  const ACTIVE_DELIVERY = new Set([
    "QUEUED",
    "RUNNING",
    "VALIDATING",
    "WAITING_CI",
    "IN_REVIEW",
  ]);
  const deliveryCount = boardTasks.filter((t) =>
    ACTIVE_DELIVERY.has(t.status),
  ).length;
  const evidenceCount = boardTasks.filter(
    (t) => t.status === "REVIEW_REQUIRED",
  ).length;

  const nextStep: NextActionStep = computeIssueWedgeNextStep({
    hasBudget,
    hasAcceptedPr,
    hasIssueLinked,
    hasQueuedOrBeyond,
    hasReviewRequired,
    hasWaitingCi,
  });

  const stackHint =
    row.project.stack === "go"
      ? "Go tip: keep the first task to one package and a small test."
      : row.project.stack === "python"
        ? "Python tip: scope the first task to one module + pytest."
        : row.project.stack === "node"
          ? "Node tip: one route or script change is enough for the smoke path."
          : row.project.stack === "html"
            ? "HTML tip: ship one visible page or docs slice — keep the first PR tiny."
            : row.project.stack !== "nextjs_ts"
              ? "Keep the first task a concrete product slice on this stack."
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
        availableMicros={usage.availableMicros}
        projectSpentMicros={usage.projectSpentMicros}
        pooled={usage.pooled}
        currency={usage.currency}
        deliveryCount={deliveryCount}
        evidenceCount={evidenceCount}
        pendingApprovals={pendingApprovals}
        lastRunStatus={lastRunStatus}
        initialTab={parseProjectTab(sp.tab)}
        overview={
          <>
            <div className={styles.overviewPrimary}>
              <NextActionStrip
                workspaceId={workspaceId}
                projectId={projectId}
                step={nextStep}
                reviewTaskId={reviewTask?.id}
                reviewTaskTitle={reviewTask?.title}
                stackHint={stackHint}
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
                  pooled: usage.pooled,
                  projectSpentMicros: usage.projectSpentMicros,
                }}
                isOwner={isOwner}
              />
            </div>
            <details
              className={styles.overviewFold}
              open={nextStep === "budget"}
            >
              <summary className={styles.overviewFoldSummary}>
                Spend detail
              </summary>
              <CostExplorerStrip
                workspaceId={workspaceId}
                projectId={projectId}
              />
            </details>
            <details
              className={styles.overviewFold}
              open={nextStep === "issue"}
            >
              <summary className={styles.overviewFoldSummary}>
                Start from GitHub
              </summary>
              <IssuesPanel
                workspaceId={workspaceId}
                projectId={projectId}
                isOwner={isOwner}
                wedgeLede={wedgeHonesty.issuesPanelLede}
                wedgeEmptyHint={wedgeHonesty.issuesEmptyHint}
                programBoundNote={wedgeHonesty.programBoundNote}
              />
            </details>
            <details
              className={styles.overviewFold}
              open={nextStep === "issue" || nextStep === "done"}
            >
              <summary className={styles.overviewFoldSummary}>
                Vision &amp; PRs
              </summary>
              <BriefPanel
                workspaceId={workspaceId}
                projectId={projectId}
                initialBrief={initialBrief}
                isOwner={isOwner}
                showArenaCta={nextStep !== "arena"}
              />
              <PullsPanel
                workspaceId={workspaceId}
                projectId={projectId}
                isOwner={isOwner}
              />
            </details>
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
        evidence={
          <EvidencePanel workspaceId={workspaceId} projectId={projectId} />
        }
        configuration={
          <>
            <MaintainerPanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialEnabled={row.project.maintainerEnabled}
              initialAutonomy={row.project.autonomyLevel}
              initialMergeEnabled={row.project.mergeEnabled}
              isOwner={isOwner}
            />
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
              arenaMinHumanStored={arenaRow?.minHuman ?? null}
              maintainerEnabled={row.project.maintainerEnabled}
              isOwner={isOwner}
            />
            <MergePanel
              workspaceId={workspaceId}
              projectId={projectId}
              initialMergeEnabled={row.project.mergeEnabled}
              autonomyLevel={row.project.autonomyLevel}
              maintainerEnabled={row.project.maintainerEnabled}
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
