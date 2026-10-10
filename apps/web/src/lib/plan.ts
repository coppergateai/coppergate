import type { ProjectPlan } from "@coppergate/db";
import {
  PlanError,
  serializeAllowedPaths,
  serializeTaskCriteria,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export function serializePlan(plan: ProjectPlan) {
  return {
    briefId: plan.briefId,
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
        priority: task.priority,
      })),
    })),
    dependencyCount: plan.dependencies.length,
  };
}

export function mapPlanError(err: unknown): never {
  if (err instanceof PlanError) {
    switch (err.code) {
      case "not_found":
        throw new ApiError("not_found", err.message);
      case "cycle":
      case "invalid_task":
      case "no_approved_brief":
        throw new ApiError("conflict", err.message);
    }
  }
  throw err;
}
