import type { Database } from "./client.js";
import { createArtifact, type ValidationReportMeta } from "./artifacts.js";
import { redactString } from "./redact.js";

export type DiffFileSummary = {
  path: string;
  action: "add" | "modify" | "delete" | "unknown";
  linesAdded?: number;
  linesRemoved?: number;
};

export type DiffSummaryBody = {
  kind: "diff_summary";
  branchName: string;
  headSha: string;
  baseSha: string;
  files: DiffFileSummary[];
  /** Redacted short notes — never secrets. */
  notes: string[];
};

export type DeliveryReportBody = {
  kind: "delivery_report";
  taskId: string;
  runId: string;
  prUrl: string;
  prNumber: number;
  branchName: string;
  headSha: string;
  actualCostMicros: number;
  validationPassed: boolean;
  filesChanged: string[];
  /** Optional preview URL (TASK038) — null/omitted when unavailable. */
  previewUrl?: string | null;
  previewError?: string | null;
};

export function buildDiffSummary(input: {
  branchName: string;
  headSha: string;
  baseSha: string;
  filesChanged: string[];
  notes?: string[];
}): DiffSummaryBody {
  return {
    kind: "diff_summary",
    branchName: input.branchName,
    headSha: input.headSha,
    baseSha: input.baseSha,
    files: input.filesChanged.map((path) => ({
      path: redactString(path),
      action: "modify" as const,
    })),
    notes: (input.notes ?? []).map(redactString),
  };
}

export function buildDeliveryReport(input: {
  taskId: string;
  runId: string;
  prUrl: string;
  prNumber: number;
  branchName: string;
  headSha: string;
  actualCostMicros: number;
  validationPassed: boolean;
  filesChanged: string[];
  previewUrl?: string | null;
  previewError?: string | null;
}): DeliveryReportBody {
  return {
    kind: "delivery_report",
    taskId: input.taskId,
    runId: input.runId,
    prUrl: input.prUrl,
    prNumber: input.prNumber,
    branchName: input.branchName,
    headSha: input.headSha,
    actualCostMicros: input.actualCostMicros,
    validationPassed: input.validationPassed,
    filesChanged: input.filesChanged.map(redactString),
    previewUrl: input.previewUrl ?? null,
    previewError: input.previewError
      ? redactString(input.previewError)
      : null,
  };
}

export async function persistDeliveryArtifacts(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    runId: string;
    diff: DiffSummaryBody;
    report: DeliveryReportBody;
  },
): Promise<void> {
  await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runId: input.runId,
    kind: "diff_summary",
    body: input.diff,
    meta: {
      fileCount: input.diff.files.length,
      branchName: input.diff.branchName,
      headSha: input.diff.headSha,
    },
  });

  await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runId: input.runId,
    kind: "delivery_report",
    body: input.report,
    meta: {
      prUrl: input.report.prUrl,
      prNumber: input.report.prNumber,
      actualCostMicros: input.report.actualCostMicros,
      validationPassed: input.report.validationPassed,
    },
  });
}

/** Type re-export for callers that also touch validation meta. */
export type { ValidationReportMeta };
