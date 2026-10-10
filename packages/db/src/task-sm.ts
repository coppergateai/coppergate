/**
 * Task workflow state machine — DATA_MODEL §4 / TASK010.
 */

export const TASK_STATUSES = [
  "DRAFT",
  "READY_FOR_APPROVAL",
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "REVIEW_REQUIRED",
  "ACCEPTED",
  "DONE",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "NEEDS_REPLAN",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Explicit allowed edges (from → to[]). */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ["READY_FOR_APPROVAL", "CANCELLED", "NEEDS_REPLAN"],
  READY_FOR_APPROVAL: ["QUEUED", "DRAFT", "CANCELLED", "NEEDS_REPLAN"],
  QUEUED: ["RUNNING", "CANCELLED", "BLOCKED", "EXPIRED"],
  RUNNING: ["VALIDATING", "FAILED", "CANCELLED", "BLOCKED", "EXPIRED"],
  VALIDATING: ["REVIEW_REQUIRED", "FAILED", "CANCELLED", "BLOCKED"],
  REVIEW_REQUIRED: ["ACCEPTED", "NEEDS_REPLAN", "DRAFT", "CANCELLED", "FAILED"],
  ACCEPTED: ["DONE", "CANCELLED"],
  DONE: [],
  BLOCKED: ["READY_FOR_APPROVAL", "QUEUED", "CANCELLED", "NEEDS_REPLAN"],
  /** FAILED → QUEUED: safe retry within max_attempts (TASK016). */
  FAILED: ["QUEUED", "READY_FOR_APPROVAL", "DRAFT", "CANCELLED", "NEEDS_REPLAN"],
  CANCELLED: [],
  EXPIRED: ["READY_FOR_APPROVAL", "DRAFT", "CANCELLED"],
  NEEDS_REPLAN: ["DRAFT", "READY_FOR_APPROVAL", "CANCELLED"],
};

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new TaskTransitionError(
      "illegal_transition",
      `Illegal transition ${from} → ${to}`,
    );
  }
}

export class TaskTransitionError extends Error {
  readonly code:
    | "illegal_transition"
    | "not_found"
    | "policy"
    | "wrong_workspace";

  constructor(code: TaskTransitionError["code"], message: string) {
    super(message);
    this.name = "TaskTransitionError";
    this.code = code;
  }
}
