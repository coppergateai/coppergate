import { and, asc, eq, inArray } from "drizzle-orm";
import {
  ApprovalError,
  expirePendingApprovals,
  requestApproval,
  resolvePendingApproval,
} from "./approvals.js";
import {
  getArenaForProject,
  startTournamentFanout,
} from "./arena.js";
import {
  assertSufficientBudget,
  BudgetError,
  reserveEstimateForTask,
} from "./budgets.js";
import type { Database } from "./client.js";
import { assertCanStartTasks, recordAuditEvent } from "./briefs.js";
import { getRunCiFitness } from "./ci-evidence.js";
import { notifyWorkspace } from "./notify.js";
import {
  assertPlanConcurrency,
  resolveWorkspacePlanLimits,
} from "./plan-policy.js";
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

/**
 * Enqueue execution after task is QUEUED — arena fan-out or single run.
 * Exported so Start can resume interrupted QUEUED work after Stop.
 */
export async function enqueueQueuedTask(
  db: Database,
  input: {
    workspaceId: string;
    task: Task;
    actor: string;
    reason: string;
  },
): Promise<Task> {
  await assertPlanConcurrency(db, input.workspaceId);
  const { limits } = await resolveWorkspacePlanLimits(db, input.workspaceId);

  const nextAttempt = input.task.attemptCount + 1;
  const arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.task.projectId,
  });

  if (
    limits.arenaEnabled &&
    arena &&
    arena.status !== "KILLED" &&
    arena.status !== "PAUSED"
  ) {
    await startTournamentFanout(db, {
      workspaceId: input.workspaceId,
      taskId: input.task.id,
      actor: input.actor,
      attempt: nextAttempt,
    });
  } else {
    await reserveEstimateForTask(db, {
      workspaceId: input.workspaceId,
      projectId: input.task.projectId,
      taskId: input.task.id,
      estimateMicros: input.task.estimateMicros ?? 0,
    });

    await enqueueAgentRun(db, {
      workspaceId: input.workspaceId,
      projectId: input.task.projectId,
      taskId: input.task.id,
      idempotencyKey: `task:${input.task.id}:attempt:${nextAttempt}`,
      estimatedCostMicros: input.task.estimateMicros ?? 0,
      spendCapMicros: input.task.estimateMicros ?? 0,
      attempt: nextAttempt,
    });
  }

  const [bumped] = await db
    .update(tasks)
    .set({ attemptCount: nextAttempt, updatedAt: new Date() })
    .where(eq(tasks.id, input.task.id))
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "task.enqueue",
    targetType: "task",
    targetId: input.task.id,
    meta: { reason: input.reason, attempt: nextAttempt },
  });

  return bumped ?? input.task;
}

/** True when every predecessor is DONE (or there are none). */
export async function predecessorsAreDone(
  db: Database,
  taskId: string,
): Promise<boolean> {
  const preds = await db
    .select({
      predecessorId: taskDependencies.predecessorTaskId,
    })
    .from(taskDependencies)
    .where(eq(taskDependencies.successorTaskId, taskId));
  if (preds.length === 0) return true;
  const predTasks = await db
    .select()
    .from(tasks)
    .where(
      inArray(
        tasks.id,
        preds.map((p) => p.predecessorId),
      ),
    );
  return predTasks.every((p) => p.status === "DONE");
}

/** DRAFT → READY_FOR_APPROVAL (or auto-queue when arena.min_human). */
export async function submitTaskForApproval(
  db: Database,
  input: { workspaceId: string; taskId: string; actor: string },
): Promise<TransitionResult & { autoQueued?: boolean }> {
  const task = await loadTask(db, input.workspaceId, input.taskId);
  if (task.status !== "DRAFT" && task.status !== "NEEDS_REPLAN") {
    throw new TaskTransitionError(
      "illegal_transition",
      "Only DRAFT/NEEDS_REPLAN tasks can be submitted",
    );
  }
  // Dependent tasks stay DRAFT until predecessors finish — never park in inbox.
  if (!(await predecessorsAreDone(db, task.id))) {
    throw new TaskTransitionError(
      "policy",
      "Predecessor tasks must be DONE before submit",
    );
  }
  if (task.status === "NEEDS_REPLAN") {
    await applyTaskTransition(db, {
      ...input,
      toStatus: "DRAFT",
      reason: "replan reset before submit",
    });
  }
  const ready = await applyTaskTransition(db, {
    ...input,
    toStatus: "READY_FOR_APPROVAL",
    reason: "submitted for approval",
  });

  const arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: ready.task.projectId,
  });

  // TASK053 — min_human: skip inbox approve; queue immediately.
  // ARMED counts as live (Start arms then boots backlog before RUNNING).
  // PAUSED/KILLED must not invent new work — caller should resume first.
  if (
    arena?.minHuman &&
    arena.status !== "KILLED" &&
    arena.status !== "PAUSED"
  ) {
    try {
      await assertQueuePolicies(db, input.workspaceId, ready.task);
    } catch (err) {
      // Roll back out of the human inbox if queue policy still blocks.
      await applyTaskTransition(db, {
        ...input,
        toStatus: "DRAFT",
        reason: "min_human queue blocked — revert to draft",
      });
      throw err;
    }
    const queued = await applyTaskTransition(db, {
      ...input,
      toStatus: "QUEUED",
      reason: "min_human auto-queue",
    });
    // Clear any orphan pending approval from an earlier pause-window submit.
    await expirePendingApprovals(db, "task", [queued.task.id]);
    const bumped = await enqueueQueuedTask(db, {
      workspaceId: input.workspaceId,
      task: queued.task,
      actor: input.actor,
      reason: "min_human",
    });
    await recordAuditEvent(db, {
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "task.min_human_queue",
      targetType: "task",
      targetId: bumped.id,
      meta: { arenaId: arena.id },
    });
    return {
      task: bumped,
      transition: queued.transition,
      autoQueued: true,
    };
  }

  await requestApproval(db, {
    workspaceId: input.workspaceId,
    projectId: ready.task.projectId,
    targetType: "task",
    targetId: ready.task.id,
    requestedBy: input.actor,
    riskSummary: ready.task.title,
  });

  void notifyWorkspace(db, {
    event: "approval_needed",
    workspaceId: input.workspaceId,
    projectId: ready.task.projectId,
    taskId: ready.task.id,
    message: `Task ready for approval: ${ready.task.title}`,
  }).catch(() => undefined);

  return ready;
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

  const bumped = await enqueueQueuedTask(db, {
    workspaceId: input.workspaceId,
    task: result.task,
    actor: input.actor,
    reason: "approved",
  });

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
    task: bumped,
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

  const bumped = await enqueueQueuedTask(db, {
    workspaceId: input.workspaceId,
    task: result.task,
    actor: input.actor,
    reason: `retry attempt ${nextAttempt}`,
  });

  const runs = await listRunsForTask(db, input.workspaceId, bumped.id);
  const run =
    runs.find(
      (r) => r.idempotencyKey === `task:${bumped.id}:attempt:${nextAttempt}`,
    ) ?? runs[0];
  if (!run) {
    throw new TaskTransitionError(
      "policy",
      "Retry queued but no agent run was created",
    );
  }

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "task.retry",
    targetType: "task",
    targetId: bumped.id,
    meta: { runId: run.id, attempt: bumped.attemptCount },
  });

  return {
    task: bumped,
    transition: result.transition,
    runId: run.id,
    attempt: bumped.attemptCount,
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
    if (latest) {
      const fitness = await getRunCiFitness(db, latest.id);
      if (fitness.blocking || latest.errorCode === "ci_failed") {
        throw new TaskTransitionError(
          "policy",
          "Cannot accept: CI checks failed on the latest run",
        );
      }
      if (fitness.awaitingLive && !fitness.passed) {
        throw new TaskTransitionError(
          "policy",
          "Cannot accept: awaiting live CI evidence on the latest run",
        );
      }
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
