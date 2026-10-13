import { RunError, type AgentRun, type AgentRunEvent } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export function serializeRun(run: AgentRun) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: run.taskId,
    status: run.status,
    attempt: run.attempt,
    agentProfileKey: run.agentProfileKey,
    baseSha: run.baseSha,
    headSha: run.headSha,
    branchName: run.branchName,
    prNumber: run.prNumber,
    prUrl: run.prUrl,
    spendCapMicros: run.spendCapMicros,
    estimatedCostMicros: run.estimatedCostMicros,
    actualCostMicros: run.actualCostMicros,
    idempotencyKey: run.idempotencyKey,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
    leaseUntil: run.leaseUntil?.toISOString() ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    tournamentId: run.tournamentId,
    contenderId: run.contenderId,
    fitnessScore: run.fitnessScore,
    efficiencyScore: run.efficiencyScore,
    fitnessEvidenceRef: run.fitnessEvidenceRef,
    previewUrl: run.previewUrl,
    tournamentResult: run.tournamentResult,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function serializeRunEvent(event: AgentRunEvent) {
  let payload: unknown = {};
  try {
    payload = JSON.parse(event.payload) as unknown;
  } catch {
    payload = { raw: event.payload };
  }
  return {
    id: event.id,
    runId: event.runId,
    seq: event.seq,
    kind: event.kind,
    payload,
    createdAt: event.createdAt.toISOString(),
  };
}

export function mapRunError(err: unknown): never {
  if (err instanceof RunError) {
    switch (err.code) {
      case "not_found":
        throw new ApiError("not_found", err.message);
      case "policy":
        throw new ApiError("bad_request", err.message);
      case "conflict":
        throw new ApiError("conflict", err.message);
      case "not_owner":
        throw new ApiError("forbidden", err.message);
    }
  }
  throw err;
}
