import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { listArtifactsForRun } from "./artifacts.js";
import { getRunCiFitness, type RunCiFitness } from "./ci-evidence.js";
import {
  getAgentRunForWorkspace,
  getTaskForWorkspace,
  listRunsForTask,
} from "./runs.js";
import { projects, tasks, type AgentRun, type Artifact } from "./schema.js";

export type EvidenceGateStatus = "passed" | "failed" | "pending" | "skipped" | "n/a";

export type EvidenceGate = {
  id: string;
  label: string;
  status: EvidenceGateStatus;
  detail: string;
  /** Hard gates block Accept when failed/pending. */
  hard: boolean;
};

export type EvidenceArtifactView = {
  id: string;
  kind: string;
  createdAt: string;
  body: unknown;
  summary: string | null;
};

export type RunEvidenceBundle = {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  projectId: string;
  projectName: string;
  runId: string;
  runStatus: string;
  prUrl: string | null;
  previewUrl: string | null;
  costMicros: number;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  ci: RunCiFitness;
  gates: EvidenceGate[];
  acceptReady: boolean;
  artifacts: EvidenceArtifactView[];
  delivery: unknown;
  diff: unknown;
  reviewFindings: unknown;
  fitnessReport: unknown;
  validationReports: unknown[];
};

export type TaskEvidenceBundle = {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  projectId: string;
  projectName: string;
  runs: Array<{
    id: string;
    status: string;
    attempt: number;
    prUrl: string | null;
    actualCostMicros: number;
    fitnessScore: number | null;
    tournamentResult: string | null;
    updatedAt: string;
  }>;
  selectedRunId: string | null;
  selected: RunEvidenceBundle | null;
  /** Tournament WINNER run id when resolved — preferred Accept target. */
  winnerRunId: string | null;
};

function parseInlineBody(meta: string | null): unknown {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { inlineBody?: string; summary?: string };
    if (typeof parsed.inlineBody === "string") {
      try {
        return JSON.parse(parsed.inlineBody) as unknown;
      } catch {
        return parsed.inlineBody;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function metaSummary(meta: string | null): string | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { summary?: string };
    return typeof parsed.summary === "string" ? parsed.summary : null;
  } catch {
    return null;
  }
}

function artifactViews(rows: Artifact[]): EvidenceArtifactView[] {
  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    createdAt: a.createdAt.toISOString(),
    body: parseInlineBody(a.meta),
    summary: metaSummary(a.meta),
  }));
}

function findBody(rows: Artifact[], kind: string): unknown {
  const art = rows.find((a) => a.kind === kind);
  return art ? parseInlineBody(art.meta) : null;
}

function buildGates(input: {
  ci: RunCiFitness;
  delivery: unknown;
  diff: unknown;
  reviewFindings: unknown;
  fitnessReport: unknown;
  run: AgentRun;
}): EvidenceGate[] {
  const { ci, delivery, diff, reviewFindings, fitnessReport, run } = input;
  const deliveryObj = delivery as { validationPassed?: boolean } | null;
  const reviewObj = reviewFindings as {
    findings?: Array<{ severity?: string }>;
  } | null;
  const criticalFindings =
    reviewObj?.findings?.filter(
      (f) => f.severity === "critical" || f.severity === "error",
    ).length ?? 0;

  const ciStatus: EvidenceGateStatus = ci.blocking
    ? "failed"
    : ci.awaitingLive && !ci.passed
      ? "pending"
      : ci.passed
        ? "passed"
        : ci.checks.length === 0
          ? "pending"
          : "n/a";

  const validationStatus: EvidenceGateStatus =
    deliveryObj?.validationPassed === true
      ? "passed"
      : deliveryObj?.validationPassed === false
        ? "failed"
        : "n/a";

  const diffStatus: EvidenceGateStatus = diff ? "passed" : "pending";

  const reviewStatus: EvidenceGateStatus = !reviewFindings
    ? "n/a"
    : criticalFindings > 0
      ? "failed"
      : "passed";

  const fitnessStatus: EvidenceGateStatus = fitnessReport
    ? run.fitnessScore != null && run.fitnessScore <= 0
      ? "failed"
      : "passed"
    : "n/a";

  const policyStatus: EvidenceGateStatus =
    run.errorCode === "policy" || run.errorCode === "stub_delivery"
      ? "failed"
      : "passed";

  return [
    {
      id: "ci",
      label: "CI / checks",
      status: ciStatus,
      detail: ci.blocking
        ? "Blocking check failed — Accept stays closed"
        : ci.awaitingLive && !ci.passed
          ? "Awaiting live CI evidence on the PR head"
          : ci.passed
            ? "Required checks passed"
            : "No CI evidence attached yet",
      hard: true,
    },
    {
      id: "validation",
      label: "Sandbox validation",
      status: validationStatus,
      detail:
        validationStatus === "passed"
          ? "Lint/test acceptance checks passed"
          : validationStatus === "failed"
            ? "Sandbox validation failed"
            : "No delivery validation report",
      hard: true,
    },
    {
      id: "diff",
      label: "Diff evidence",
      status: diffStatus,
      detail: diff
        ? "Diff summary available for review"
        : "Waiting for diff summary artifact",
      hard: true,
    },
    {
      id: "review",
      label: "Review findings",
      status: reviewStatus,
      detail:
        reviewStatus === "failed"
          ? `${criticalFindings} critical finding(s)`
          : reviewStatus === "passed"
            ? "No critical reviewer findings"
            : "Reviewer report not attached",
      hard: false,
    },
    {
      id: "fitness",
      label: "Fitness / critic",
      status: fitnessStatus,
      detail: fitnessReport
        ? `Score ${run.fitnessScore ?? "—"} · efficiency ${run.efficiencyScore ?? "—"}`
        : "No tournament fitness report (solo run OK)",
      hard: false,
    },
    {
      id: "policy",
      label: "Policy compliance",
      status: policyStatus,
      detail:
        policyStatus === "failed"
          ? "Policy or stub delivery blocked this run"
          : "No policy violation recorded",
      hard: true,
    },
  ];
}

export async function getRunEvidenceBundle(
  db: Database,
  workspaceId: string,
  runId: string,
): Promise<RunEvidenceBundle | null> {
  const run = await getAgentRunForWorkspace(db, workspaceId, runId);
  if (!run || !run.taskId) return null;

  const task = await getTaskForWorkspace(db, workspaceId, run.taskId);
  if (!task) return null;

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(eq(projects.id, run.projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);

  const rows = await listArtifactsForRun(db, workspaceId, run.id);
  const ci = await getRunCiFitness(db, run.id);
  const delivery = findBody(rows, "delivery_report");
  const diff = findBody(rows, "diff_summary");
  const reviewFindings = findBody(rows, "review_findings");
  const fitnessReport = findBody(rows, "fitness_report");
  const validationReports = rows
    .filter((a) => a.kind === "validation_report")
    .map((a) => parseInlineBody(a.meta));

  const gates = buildGates({
    ci,
    delivery,
    diff,
    reviewFindings,
    fitnessReport,
    run,
  });

  const hardBlocked = gates.some(
    (g) =>
      g.hard &&
      (g.id === "ci" || g.id === "validation" || g.id === "policy") &&
      g.status === "failed",
  );

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskStatus: task.status,
    projectId: run.projectId,
    projectName: project?.name ?? "Project",
    runId: run.id,
    runStatus: run.status,
    prUrl: run.prUrl ?? task.prUrl,
    previewUrl: run.previewUrl,
    costMicros: run.actualCostMicros,
    fitnessScore: run.fitnessScore,
    efficiencyScore: run.efficiencyScore,
    ci,
    gates,
    /** Align with server Accept: CI ready + no hard validation/policy fail. */
    acceptReady: ci.acceptReady && !hardBlocked,
    artifacts: artifactViews(rows),
    delivery,
    diff,
    reviewFindings,
    fitnessReport,
    validationReports,
  };
}

/**
 * Task-level evidence: run list + selected run bundle (latest with artifacts, else latest).
 */
export async function getTaskEvidenceBundle(
  db: Database,
  workspaceId: string,
  taskId: string,
  preferredRunId?: string | null,
): Promise<TaskEvidenceBundle | null> {
  const task = await getTaskForWorkspace(db, workspaceId, taskId);
  if (!task) return null;

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.id, task.projectId),
        eq(projects.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  const runs = await listRunsForTask(db, workspaceId, taskId);
  const runViews = runs.map((r) => ({
    id: r.id,
    status: r.status,
    attempt: r.attempt,
    prUrl: r.prUrl,
    actualCostMicros: r.actualCostMicros,
    fitnessScore: r.fitnessScore,
    tournamentResult: r.tournamentResult,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const winner = runs.find((r) => r.tournamentResult === "WINNER");
  const winnerRunId = winner?.id ?? null;

  let selectedRunId =
    preferredRunId && runs.some((r) => r.id === preferredRunId)
      ? preferredRunId
      : null;

  if (!selectedRunId && runs.length > 0) {
    // Survivor first: never pick a LOSER over the WINNER when both have PRs.
    const withDelivery =
      winner ??
      runs.find(
        (r) =>
          r.tournamentResult !== "LOSER" &&
          r.tournamentResult !== "CANCELLED" &&
          (r.prUrl ||
            r.status === "SUCCEEDED" ||
            r.status === "AWAITING_REVIEW" ||
            r.status === "REVIEW_REQUIRED"),
      ) ??
      runs.find((r) => r.prUrl) ??
      runs[0];
    selectedRunId = withDelivery!.id;
  }

  const selected = selectedRunId
    ? await getRunEvidenceBundle(db, workspaceId, selectedRunId)
    : null;

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskStatus: task.status,
    projectId: task.projectId,
    projectName: project?.name ?? "Project",
    runs: runViews,
    selectedRunId,
    selected,
    winnerRunId,
  };
}

/** Recent project deliveries that have reviewable evidence. */
export async function listProjectEvidenceDeliveries(
  db: Database,
  workspaceId: string,
  projectId: string,
  limit = 20,
): Promise<
  Array<{
    taskId: string;
    title: string;
    status: string;
    prUrl: string | null;
    updatedAt: string;
    runId: string | null;
    acceptReady: boolean | null;
    winnerRunId: string | null;
    isSurvivor: boolean;
  }>
> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      prUrl: tasks.prUrl,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.projectId, projectId),
        inArray(tasks.status, [
          "REVIEW_REQUIRED",
          "WAITING_CI",
          "IN_REVIEW",
          "ACCEPTED",
          "DONE",
          "FAILED",
        ]),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(limit);

  const out: Array<{
    taskId: string;
    title: string;
    status: string;
    prUrl: string | null;
    updatedAt: string;
    runId: string | null;
    acceptReady: boolean | null;
    winnerRunId: string | null;
    isSurvivor: boolean;
  }> = [];

  for (const t of rows) {
    let runId: string | null = null;
    let acceptReady: boolean | null = null;
    let winnerRunId: string | null = null;
    let isSurvivor = false;
    if (t.status === "REVIEW_REQUIRED" || t.status === "WAITING_CI") {
      const bundle = await getTaskEvidenceBundle(db, workspaceId, t.id);
      runId = bundle?.selectedRunId ?? null;
      acceptReady = bundle?.selected?.acceptReady ?? null;
      winnerRunId = bundle?.winnerRunId ?? null;
      isSurvivor = Boolean(
        winnerRunId && runId && winnerRunId === runId,
      );
    }
    out.push({
      taskId: t.id,
      title: t.title,
      status: t.status,
      prUrl: t.prUrl,
      updatedAt: t.updatedAt.toISOString(),
      runId,
      acceptReady,
      winnerRunId,
      isSurvivor,
    });
  }
  return out;
}
