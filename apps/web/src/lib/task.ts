import { TaskTransitionError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import type { Task, TaskStatusTransition } from "@coppergate/db";

export function serializeTask(task: Task) {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    milestoneId: task.milestoneId,
    briefId: task.briefId,
    title: task.title,
    goal: task.goal,
    scope: task.scope,
    status: task.status,
    estimateMicros: task.estimateMicros,
    estimateComplexity: task.estimateComplexity,
    priority: task.priority,
    attemptCount: task.attemptCount,
    maxAttempts: task.maxAttempts,
    prUrl: task.prUrl,
    githubIssueNumber: task.githubIssueNumber,
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function serializeTransition(t: TaskStatusTransition) {
  return {
    id: t.id,
    fromStatus: t.fromStatus,
    toStatus: t.toStatus,
    actor: t.actor,
    reason: t.reason,
    createdAt: t.createdAt.toISOString(),
  };
}

export function mapTaskTransitionError(err: unknown): never {
  if (err instanceof TaskTransitionError) {
    switch (err.code) {
      case "not_found":
      case "wrong_workspace":
        throw new ApiError("not_found", err.message);
      case "illegal_transition":
      case "policy":
        throw new ApiError("conflict", err.message);
    }
  }
  throw err;
}
