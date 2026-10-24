import type { Database } from "./client.js";
import {
  createArtifact,
  listArtifactsForRun,
  parseArtifactMeta,
  type ValidationReportMeta,
} from "./artifacts.js";
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

/**
 * Durable post-PR checkpoint — written immediately after GitHub delivery succeeds
 * so VALIDATING lease loss can recover without failing a shipped PR.
 */
export type DeliveryCheckpointBody = {
  kind: "delivery_checkpoint";
  taskId: string;
  runId: string;
  prUrl: string;
  prNumber: number;
  branchName: string;
  headSha: string;
  actualCostMicros: number;
  /** When true, finalize as WAITING_CI; else REVIEW_REQUIRED. */
  awaitLiveCi: boolean;
  previewUrl?: string | null;
};

export function buildDeliveryCheckpoint(input: {
  taskId: string;
  runId: string;
  prUrl: string;
  prNumber: number;
  branchName: string;
  headSha: string;
  actualCostMicros: number;
  awaitLiveCi: boolean;
  previewUrl?: string | null;
}): DeliveryCheckpointBody {
  return {
    kind: "delivery_checkpoint",
    taskId: input.taskId,
    runId: input.runId,
    prUrl: input.prUrl,
    prNumber: input.prNumber,
    branchName: input.branchName,
    headSha: input.headSha,
    actualCostMicros: input.actualCostMicros,
    awaitLiveCi: input.awaitLiveCi,
    previewUrl: input.previewUrl ?? null,
  };
}

export function parseDeliveryCheckpoint(
  raw: unknown,
): DeliveryCheckpointBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "delivery_checkpoint" || o.kind === "delivery_report") {
    const prUrl = typeof o.prUrl === "string" ? o.prUrl : "";
    const branchName = typeof o.branchName === "string" ? o.branchName : "";
    const headSha = typeof o.headSha === "string" ? o.headSha : "";
    const prNumber = Number(o.prNumber);
    if (!prUrl || !branchName || !headSha || !Number.isFinite(prNumber)) {
      return null;
    }
    return {
      kind: "delivery_checkpoint",
      taskId: typeof o.taskId === "string" ? o.taskId : "",
      runId: typeof o.runId === "string" ? o.runId : "",
      prUrl,
      prNumber: Math.floor(prNumber),
      branchName,
      headSha,
      actualCostMicros: Number(o.actualCostMicros ?? 0) || 0,
      // Unknown legacy delivery_report → wait for CI (never open Accept early).
      awaitLiveCi:
        typeof o.awaitLiveCi === "boolean" ? o.awaitLiveCi : true,
      previewUrl:
        typeof o.previewUrl === "string" || o.previewUrl === null
          ? (o.previewUrl as string | null)
          : null,
    };
  }
  return null;
}

export async function persistDeliveryCheckpoint(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    runId: string;
    checkpoint: DeliveryCheckpointBody;
  },
): Promise<void> {
  await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runId: input.runId,
    kind: "delivery_checkpoint",
    body: input.checkpoint,
    meta: {
      prUrl: input.checkpoint.prUrl,
      prNumber: input.checkpoint.prNumber,
      headSha: input.checkpoint.headSha,
      awaitLiveCi: input.checkpoint.awaitLiveCi,
    },
  });
}

/** Latest delivery_checkpoint, else delivery_report (resume / reaper recovery). */
export async function getDeliveryCheckpoint(
  db: Database,
  workspaceId: string,
  runId: string,
): Promise<DeliveryCheckpointBody | null> {
  const rows = await listArtifactsForRun(db, workspaceId, runId);
  const ordered = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  for (const kind of ["delivery_checkpoint", "delivery_report"] as const) {
    for (const row of ordered) {
      if (row.kind !== kind) continue;
      const meta = parseArtifactMeta(row);
      let body: unknown = meta;
      if (typeof meta.inlineBody === "string") {
        try {
          body = JSON.parse(meta.inlineBody);
        } catch {
          body = meta;
        }
      }
      const parsed = parseDeliveryCheckpoint(body);
      if (parsed) return parsed;
    }
  }
  return null;
}

/** Type re-export for callers that also touch validation meta. */
export type { ValidationReportMeta };
