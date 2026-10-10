import { and, asc, eq, inArray } from "drizzle-orm";
import {
  ApprovalError,
  requestApproval,
  resolvePendingApproval,
} from "./approvals.js";
import {
  assertSufficientBudget,
  BudgetError,
  reserveEstimateForTask,
} from "./budgets.js";
import type { Database } from "./client.js";
import { assertCanStartTasks, recordAuditEvent } from "./briefs.js";
import { runHasBlockingCi } from "./ci-evidence.js";
import { enqueueAgentRun, listRunsForTask } from "./runs.js";
import {
  githubInstallations,
  projects,
  repositoryConnections,
  taskDependencies,
  tasks,
  taskStatusTransitions,
  type Task,
  type TaskStatusTransition,
} from "./schema.js";
import {
  assertTransition,
  canTransition,
  isTaskStatus,
  TaskTransitionError,
  type TaskStatus,
} from "./task-sm.js";

export type TransitionResult = {
  task: Task;
  transition: TaskStatusTransition;
};

async function loadTask(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<Task> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
    .limit(1);
  if (!task) {
    throw new TaskTransitionError("not_found", "Task not found");
  }
  return task;
}

export async function listTaskTransitions(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<TaskStatusTransition[]> {
  await loadTask(db, workspaceId, taskId);
  return db
    .select()
    .from(taskStatusTransitions)
    .where(
      and(
        eq(taskStatusTransitions.taskId, taskId),
        eq(taskStatusTransitions.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(taskStatusTransitions.createdAt));
}

/**
 * Apply a legal transition and append an audit row (actor + timestamp).
 */
export async function applyTaskTransition(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    toStatus: TaskStatus;
    actor: string;
    reason?: string;
  },
): Promise<TransitionResult> {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, input.taskId),
          eq(tasks.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);

    if (!task) {
      throw new TaskTransitionError("not_found", "Task not found");
    }
    if (!isTaskStatus(task.status)) {
      throw new TaskTransitionError(
        "illegal_transition",
        `Unknown task status: ${task.status}`,
      );
    }

    const from = task.status;
    assertTransition(from, input.toStatus);

    const now = new Date();
    const [updated] = await tx
      .update(tasks)
      .set({ status: input.toStatus, updatedAt: now })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, from)))
      .returning();

    if (!updated) {
      throw new TaskTransitionError(
        "illegal_transition",
        "Task status changed concurrently",
      );
    }

    const [transition] = await tx
      .insert(taskStatusTransitions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        taskId: task.id,
        fromStatus: from,
        toStatus: input.toStatus,
        actor: input.actor,
        reason: input.reason ?? null,
        createdAt: now,
      })
      .returning();

    if (!transition) throw new Error("Failed to record transition");

    return { task: updated, transition };
  });
}

/** DRAFT → READY_FOR_APPROVAL */
export async function submitTaskForApproval(
  db: Database,
  input: { workspaceId: string; taskId: string; actor: string },
): Promise<TransitionResult> {
  const task = await loadTask(db, input.workspaceId, input.taskId);
  if (task.status !== "DRAFT" && task.status !== "NEEDS_REPLAN") {
    throw new TaskTransitionError(
      "illegal_transition",
      "Only DRAFT/NEEDS_REPLAN tasks can be submitted",
    );
  }
  if (task.status === "NEEDS_REPLAN") {
    await applyTaskTransition(db, {
      ...input,
      toStatus: "DRAFT",
      reason: "replan reset before submit",
    });
  }
  const result = await applyTaskTransition(db, {
    ...input,
    toStatus: "READY_FOR_APPROVAL",
    reason: "submitted for approval",
  });

  await requestApproval(db, {
    workspaceId: input.workspaceId,
    projectId: result.task.projectId,
    targetType: "task",
    targetId: result.task.id,
    requestedBy: input.actor,
    riskSummary: result.task.title,
  });

  return result;
}

async function assertQueuePolicies(
  db: Database,
  workspaceId: string,
  task: Task,
): Promise<void> {
  await assertCanStartTasks(db, workspaceId, task.projectId).catch((err) => {
    throw new TaskTransitionError(
      "policy",
      err instanceof Error
        ? err.message
        : "Approved brief required before queue",
    );
  });

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, task.projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!project) {
    throw new TaskTransitionError("not_found", "Project not found");
  }

  if (project.autonomyLevel === "L0") {
    throw new TaskTransitionError(
      "policy",
      "Autonomy L0 cannot enqueue tasks (need L1+)",
    );
  }

  const estimate = task.estimateMicros ?? 0;
  try {
    await assertSufficientBudget(db, workspaceId, task.projectId, estimate);
  } catch (err) {
    if (err instanceof BudgetError) {
      throw new TaskTransitionError("policy", err.message);
    }
    throw err;
  }

  const [repo] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, task.projectId))
    .limit(1);

  if (!repo || repo.installationStatus !== "active") {
    throw new TaskTransitionError(
      "policy",
      "Active repository connection required",
    );
  }

  const [install] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.id, repo.installationId))
    .limit(1);

  if (!install || install.status !== "active") {
    throw new TaskTransitionError(
      "policy",
      "GitHub App installation is not active",
    );
  }

  const preds = await db
    .select({
      predecessorId: taskDependencies.predecessorTaskId,
    })
    .from(taskDependencies)
    .where(eq(taskDependencies.successorTaskId, task.id));

  if (preds.length) {
    const predTasks = await db
      .select()
      .from(tasks)
      .where(
        inArray(
          tasks.id,
          preds.map((p) => p.predecessorId),
        ),
      );
    const blocked = predTasks.filter((p) => p.status !== "DONE");
    if (blocked.length) {
      throw new TaskTransitionError(
        "policy",
        "Predecessor tasks must be DONE before queue",
      );
    }
  }
}

/**
 * READY_FOR_APPROVAL → QUEUED after policy checks (DATA_MODEL §5).
 */
export async function approveTask(
  db: Database,
  input: { workspaceId: string; taskId: string; actor: string },
): Promise<TransitionResult> {
  const task = await loadTask(db, input.workspaceId, input.taskId);
  if (task.status !== "READY_FOR_APPROVAL") {
    throw new TaskTransitionError(
      "illegal_transition",
      "Only READY_FOR_APPROVAL tasks can be approved",
    );
  }
  await assertQueuePolicies(db, input.workspaceId, task);
  const result = await applyTaskTransition(db, {
    ...input,
    toStatus: "QUEUED",
    reason: "approved",
  });

  await reserveEstimateForTask(db, {
    workspaceId: input.workspaceId,
    projectId: result.task.projectId,
    taskId: result.task.id,
    estimateMicros: result.task.estimateMicros ?? 0,
  });

  const nextAttempt = result.task.attemptCount + 1;
  await enqueueAgentRun(db, {
    workspaceId: input.workspaceId,
    projectId: result.task.projectId,
    taskId: result.task.id,
    idempotencyKey: `task:${result.task.id}:attempt:${nextAttempt}`,
    estimatedCostMicros: result.task.estimateMicros ?? 0,
    spendCapMicros: result.task.estimateMicros ?? 0,
    attempt: nextAttempt,
  });

  const [bumped] = await db
    .update(tasks)
    .set({ attemptCount: nextAttempt, updatedAt: new Date() })
    .where(eq(tasks.id, result.task.id))
    .returning();

  try {
    await resolvePendingApproval(db, {
      workspaceId: input.workspaceId,
      targetType: "task",
      targetId: result.task.id,
      decision: "approved",
      actor: input.actor,
      decisionNote: "task approved for queue",
    });
  } catch (err) {
    if (!(err instanceof ApprovalError && err.code === "not_pending")) {
      throw err;
    }
  }

  return {
    task: bumped ?? result.task,
    transition: result.transition,
  };
}

/**
 * Safe retry after FAILED (TASK016 / FR-09).
 * New attempt + new idempotency key; prior run events preserved.
 */
export async function retryFailedTask(
  db: Database,
  input: { workspaceId: string; taskId: string; actor: string },
): Promise<TransitionResult & { runId: string; attempt: number }> {
  const task = await loadTask(db, input.workspaceId, input.taskId);
  if (task.status !== "FAILED") {
    throw new TaskTransitionError(
      "illegal_transition",
      "Only FAILED tasks can be retried",
    );
  }
  if (task.attemptCount >= task.maxAttempts) {
    throw new TaskTransitionError(
      "policy",
      `max_attempts (${task.maxAttempts}) exhausted`,
    );
  }

  await assertQueuePolicies(db, input.workspaceId, task);

  const nextAttempt = task.attemptCount + 1;
  const result = await applyTaskTransition(db, {
    workspaceId: input.workspaceId,
    taskId: task.id,
    toStatus: "QUEUED",
    actor: input.actor,
    reason: `retry attempt ${nextAttempt}`,
  });

  await reserveEstimateForTask(db, {
    workspaceId: input.workspaceId,
    projectId: result.task.projectId,
    taskId: result.task.id,
    estimateMicros: result.task.estimateMicros ?? 0,
  });

  const { run } = await enqueueAgentRun(db, {
    workspaceId: input.workspaceId,
    projectId: result.task.projectId,
    taskId: result.task.id,
    idempotencyKey: `task:${result.task.id}:attempt:${nextAttempt}`,
    estimatedCostMicros: result.task.estimateMicros ?? 0,
    spendCapMicros: result.task.estimateMicros ?? 0,
    attempt: nextAttempt,
  });

  const [bumped] = await db
    .update(tasks)
    .set({ attemptCount: nextAttempt, updatedAt: new Date() })
    .where(eq(tasks.id, result.task.id))
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "task.retry",
    targetType: "task",
    targetId: result.task.id,
    meta: { runId: run.id, attempt: nextAttempt },
  });

  return {
    task: bumped ?? result.task,
    transition: result.transition,
    runId: run.id,
    attempt: nextAttempt,
  };
}

export async function cancelTask(
  db: Database,
  input: { workspaceId: string; taskId: string; actor: string; reason?: string },
): Promise<TransitionResult> {
  const task = await loadTask(db, input.workspaceId, input.taskId);
  if (!isTaskStatus(task.status)) {
    throw new TaskTransitionError(
      "illegal_transition",
      `Unknown task status: ${task.status}`,
    );
  }
  if (!canTransition(task.status, "CANCELLED")) {
    throw new TaskTransitionError(
      "illegal_transition",
      `Cannot cancel from ${task.status}`,
    );
  }
  return applyTaskTransition(db, {
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    actor: input.actor,
    toStatus: "CANCELLED",
    reason: input.reason ?? "cancelled",
  });
}

export type ReviewDecision = "accept" | "reject" | "request_changes";

/**
 * Human review on REVIEW_REQUIRED (TASK024 / FR-08).
 * accept → ACCEPTED → DONE; reject → FAILED; request_changes → NEEDS_REPLAN.
 * Blocking CI prevents accept.
 */
export async function decideTaskReview(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    actor: string;
    decision: ReviewDecision;
    note?: string;
  },
): Promise<TransitionResult> {
  const task = await loadTask(db, input.workspaceId, input.taskId);
  if (task.status !== "REVIEW_REQUIRED") {
    throw new TaskTransitionError(
      "illegal_transition",
      "Only REVIEW_REQUIRED tasks can be reviewed",
    );
  }

  if (input.decision === "accept") {
    const runs = await listRunsForTask(db, input.workspaceId, task.id);
    const latest = runs[0];
    if (latest && (await runHasBlockingCi(db, latest.id))) {
      throw new TaskTransitionError(
        "policy",
        "Cannot accept: CI checks failed on the latest run",
      );
    }
    if (latest?.errorCode === "ci_failed") {
      throw new TaskTransitionError(
        "policy",
        "Cannot accept: latest run marked ci_failed",
      );
    }

    const accepted = await applyTaskTransition(db, {
      workspaceId: input.workspaceId,
      taskId: task.id,
      actor: input.actor,
      toStatus: "ACCEPTED",
      reason: input.note ?? "accepted",
    });

    const done = await applyTaskTransition(db, {
      workspaceId: input.workspaceId,
      taskId: task.id,
      actor: input.actor,
      toStatus: "DONE",
      reason: "accepted delivery",
    });

    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "task.review.accept",
      targetType: "task",
      targetId: task.id,
      meta: { note: input.note ?? null, runId: latest?.id ?? null },
    });

    try {
      await resolvePendingApproval(db, {
        workspaceId: input.workspaceId,
        targetType: "run_review",
        targetId: latest?.id ?? task.id,
        decision: "approved",
        actor: input.actor,
        decisionNote: input.note ?? "accepted",
      });
    } catch (err) {
      if (!(err instanceof ApprovalError && err.code === "not_pending")) {
        // also try task-targeted approval
        try {
          await resolvePendingApproval(db, {
            workspaceId: input.workspaceId,
            targetType: "task",
            targetId: task.id,
            decision: "approved",
            actor: input.actor,
            decisionNote: input.note ?? "accepted",
          });
        } catch (err2) {
          if (!(err2 instanceof ApprovalError && err2.code === "not_pending")) {
            throw err2;
          }
        }
      }
    }

    return { task: done.task, transition: accepted.transition };
  }

  if (input.decision === "reject") {
    const result = await applyTaskTransition(db, {
      workspaceId: input.workspaceId,
      taskId: task.id,
      actor: input.actor,
      toStatus: "FAILED",
      reason: input.note ?? "rejected",
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "task.review.reject",
      targetType: "task",
      targetId: task.id,
      meta: { note: input.note ?? null },
    });
    return result;
  }

  // request_changes
  const result = await applyTaskTransition(db, {
    workspaceId: input.workspaceId,
    taskId: task.id,
    actor: input.actor,
    toStatus: "NEEDS_REPLAN",
    reason: input.note ?? "changes requested",
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "task.review.request_changes",
    targetType: "task",
    targetId: task.id,
    meta: { note: input.note ?? null },
  });
  return result;
}

export { canTransition, ALLOWED_TRANSITIONS } from "./task-sm.js";
