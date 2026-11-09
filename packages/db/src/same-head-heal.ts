/**
 * Same-head heal — fix a red / stale delivery PR by pushing onto its own head
 * branch instead of opening a parallel PR from main.
 *
 * The parent task gets a new run that checks out the PR head SHA, carries the
 * failure context into the prompt, and delivers a CAS commit onto the same
 * branch (PR number unchanged). Bounded by SAME_HEAD_MAX_ATTEMPTS per PR.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { getArenaForProject } from "./arena.js";
import { recordAuditEvent } from "./briefs.js";
import { reserveEstimateForTask } from "./budgets.js";
import { evaluateCiFlakeCooldown } from "./flake-cooldown.js";
import { selectAutoAcceptRun } from "./maintainer.js";
import { appendRunEvent, listRunEvents } from "./run-events.js";
import { enqueueAgentRun, listRunsForTask } from "./runs.js";
import { agentRuns, tasks, type AgentRun } from "./schema.js";
import { applyTaskTransition } from "./task-transitions.js";

export const SAME_HEAD_IDEMPOTENCY_PREFIX = "same_head:";
export const SAME_HEAD_RUN_EVENT_KIND = "same_head_heal";
/** Superseded delivery run (its PR head is being fixed by a same-head run). */
export const SAME_HEAD_SUPERSEDED_ERROR_CODE = "superseded_same_head";
/** Same-head heal runs per PR before the board falls back to replan. */
export const SAME_HEAD_MAX_ATTEMPTS = 2;

export type SameHeadHealReason = "ci_failure" | "stale_delivery";

export type SameHeadFailingCheck = {
  name: string;
  conclusion: string | null;
  detailsUrl: string | null;
};

export type SameHeadHealContext = {
  reason: SameHeadHealReason;
  prNumber: number;
  headRef: string;
  headSha: string;
  attempt: number;
  maxAttempts: number;
  supersededRunId: string;
  failingChecks: SameHeadFailingCheck[];
};

export function isSameHeadRun(run: { idempotencyKey?: string | null }): boolean {
  return (run.idempotencyKey ?? "").startsWith(SAME_HEAD_IDEMPOTENCY_PREFIX);
}

export function sameHeadIdempotencyKey(input: {
  prNumber: number;
  headSha: string;
}): string {
  return `${SAME_HEAD_IDEMPOTENCY_PREFIX}pr:${input.prNumber}:${input.headSha}`;
}

export type SameHeadHealDecision =
  | { arm: true; attempt: number }
  | {
      arm: false;
      skip:
        | "task_not_delivered"
        | "no_delivery_pr"
        | "not_failing"
        | "active_run"
        | "arena_paused"
        | "flake_cooldown"
        | "exhausted";
    };

/** Pure gate — callers resolve arena / flake / runs and pass them in. */
export function decideSameHeadHeal(input: {
  reason: SameHeadHealReason;
  taskStatus: string;
  candidate: {
    status: string;
    errorCode: string | null;
    prNumber: number | null;
    branchName: string | null;
    headSha: string | null;
  } | null;
  /** Same-head runs already spent on this PR. */
  priorAttempts: number;
  /** Any run on the task still QUEUED / RUNNING / VALIDATING. */
  hasActiveRun: boolean;
  arenaStatus: string | null;
  flakeSuppressed: boolean;
}): SameHeadHealDecision {
  const expectedTask =
    input.reason === "ci_failure" ? "WAITING_CI" : "REVIEW_REQUIRED";
  if (input.taskStatus !== expectedTask) {
    return { arm: false, skip: "task_not_delivered" };
  }
  const c = input.candidate;
  if (
    !c ||
    !c.prNumber ||
    c.prNumber <= 0 ||
    !c.branchName?.trim() ||
    !c.headSha?.trim() ||
    c.headSha === "unknown"
  ) {
    return { arm: false, skip: "no_delivery_pr" };
  }
  if (input.reason === "ci_failure" && c.errorCode !== "ci_failed") {
    return { arm: false, skip: "not_failing" };
  }
  if (input.hasActiveRun) return { arm: false, skip: "active_run" };
  if (input.arenaStatus === "PAUSED" || input.arenaStatus === "KILLED") {
    return { arm: false, skip: "arena_paused" };
  }
  if (input.flakeSuppressed) return { arm: false, skip: "flake_cooldown" };
  if (input.priorAttempts >= SAME_HEAD_MAX_ATTEMPTS) {
    return { arm: false, skip: "exhausted" };
  }
  return { arm: true, attempt: input.priorAttempts + 1 };
}

const ACTIVE_RUN_STATUSES = new Set(["QUEUED", "RUNNING", "VALIDATING"]);

export type ArmSameHeadHealResult = {
  armed: boolean;
  skip?: Extract<SameHeadHealDecision, { arm: false }>["skip"];
  runId?: string;
  attempt?: number;
};

/**
 * Supersede the delivery run and queue a same-head fix run on the parent task.
 * Returns `{ armed: false, skip }` without side effects when the gate refuses.
 */
export async function armSameHeadHealRun(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    actor: string;
    reason: SameHeadHealReason;
  },
): Promise<ArmSameHeadHealResult> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!task) return { armed: false, skip: "task_not_delivered" };

  const runs = await listRunsForTask(db, input.workspaceId, task.id);
  const candidate = selectAutoAcceptRun(runs);
  const prNumber = candidate?.prNumber ?? null;
  const priorAttempts =
    prNumber == null
      ? 0
      : runs.filter((r) => isSameHeadRun(r) && r.prNumber === prNumber).length;

  let failingChecks: SameHeadFailingCheck[] = [];
  let flakeSuppressed = false;
  if (input.reason === "ci_failure" && candidate) {
    const { getRunCiFitness } = await import("./ci-evidence.js");
    const fitness = await getRunCiFitness(db, candidate.id);
    failingChecks = fitness.checks
      .filter((c) => c.blocksAccept && !c.passed)
      .slice(0, 4)
      .map((c) => ({
        name: c.name,
        conclusion: c.conclusion,
        detailsUrl: c.detailsUrl,
      }));
    for (const check of failingChecks) {
      const cool = await evaluateCiFlakeCooldown(db, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        checkName: check.name,
      });
      if (cool.suppress) flakeSuppressed = true;
    }
  }

  const arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });

  const decision = decideSameHeadHeal({
    reason: input.reason,
    taskStatus: task.status,
    candidate: candidate ?? null,
    priorAttempts,
    hasActiveRun: runs.some((r) => ACTIVE_RUN_STATUSES.has(r.status)),
    arenaStatus: arena?.status ?? null,
    flakeSuppressed,
  });
  if (!decision.arm) return { armed: false, skip: decision.skip };
  const delivered = candidate as AgentRun;

  await applyTaskTransition(db, {
    workspaceId: input.workspaceId,
    taskId: task.id,
    toStatus: "QUEUED",
    actor: input.actor,
    reason: `same-head ${input.reason} heal ${decision.attempt}/${SAME_HEAD_MAX_ATTEMPTS} on PR #${delivered.prNumber}`,
  });

  await db
    .update(agentRuns)
    .set({
      status: "FAILED",
      errorCode: SAME_HEAD_SUPERSEDED_ERROR_CODE,
      errorMessage: `Superseded by same-head ${input.reason} heal on PR #${delivered.prNumber}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.id, delivered.id),
        inArray(agentRuns.status, ["WAITING_CI", "REVIEW_REQUIRED"]),
      ),
    );

  await reserveEstimateForTask(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: task.id,
    estimateMicros: task.estimateMicros ?? 0,
  });

  const { run } = await enqueueAgentRun(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: task.id,
    idempotencyKey: sameHeadIdempotencyKey({
      prNumber: delivered.prNumber!,
      headSha: delivered.headSha!,
    }),
    baseSha: delivered.headSha!,
    branchName: delivered.branchName!,
    agentProfileKey: "fixer",
    estimatedCostMicros: task.estimateMicros ?? 0,
    spendCapMicros: task.estimateMicros ?? 0,
  });

  const context: SameHeadHealContext = {
    reason: input.reason,
    prNumber: delivered.prNumber!,
    headRef: delivered.branchName!,
    headSha: delivered.headSha!,
    attempt: decision.attempt,
    maxAttempts: SAME_HEAD_MAX_ATTEMPTS,
    supersededRunId: delivered.id,
    failingChecks,
  };
  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: input.workspaceId,
    kind: SAME_HEAD_RUN_EVENT_KIND,
    payload: context,
  });
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "same_head_heal.armed",
    targetType: "task",
    targetId: task.id,
    meta: { projectId: input.projectId, runId: run.id, ...context },
  });

  return { armed: true, runId: run.id, attempt: decision.attempt };
}

/** Heal context recorded when the same-head run was armed (null otherwise). */
export async function getSameHeadHealContext(
  db: Database,
  input: { workspaceId: string; runId: string },
): Promise<SameHeadHealContext | null> {
  const events = await listRunEvents(db, input.runId);
  const hit = events.find(
    (e) =>
      e.workspaceId === input.workspaceId &&
      e.kind === SAME_HEAD_RUN_EVENT_KIND,
  );
  if (!hit) return null;
  try {
    const payload = JSON.parse(hit.payload) as Partial<SameHeadHealContext>;
    if (
      (payload.reason !== "ci_failure" && payload.reason !== "stale_delivery") ||
      typeof payload.prNumber !== "number" ||
      typeof payload.headRef !== "string" ||
      typeof payload.headSha !== "string"
    ) {
      return null;
    }
    return {
      reason: payload.reason,
      prNumber: payload.prNumber,
      headRef: payload.headRef,
      headSha: payload.headSha,
      attempt: payload.attempt ?? 1,
      maxAttempts: payload.maxAttempts ?? SAME_HEAD_MAX_ATTEMPTS,
      supersededRunId: payload.supersededRunId ?? "",
      failingChecks: Array.isArray(payload.failingChecks)
        ? payload.failingChecks
        : [],
    };
  } catch {
    return null;
  }
}

/** Prompt block for the coding agent on a same-head heal run. */
export function buildSameHeadHealPrompt(
  ctx: SameHeadHealContext,
  extra?: { checkOutput?: string | null },
): string {
  const why =
    ctx.reason === "ci_failure"
      ? "Required CI failed on this PR's head."
      : "This PR timed out waiting for accept-ready CI.";
  const lines = [
    `## Same-head heal (PR #${ctx.prNumber}, attempt ${ctx.attempt}/${ctx.maxAttempts})`,
    ``,
    `${why} The workdir is checked out at the PR head \`${ctx.headRef}\` @ ${ctx.headSha.slice(0, 12)}.`,
    `Your changes are committed onto that same branch — do not start over from main and do not widen scope.`,
    ``,
  ];
  if (ctx.failingChecks.length > 0) {
    lines.push(`### Failing checks`);
    for (const c of ctx.failingChecks) {
      lines.push(
        `- \`${c.name}\`: ${c.conclusion ?? "failed"}${c.detailsUrl ? ` — ${c.detailsUrl}` : ""}`,
      );
    }
    lines.push(``);
  }
  const output = extra?.checkOutput?.trim();
  if (output) {
    lines.push(`### Check output (truncated)`, "```", output.slice(0, 4_000), "```", ``);
  }
  lines.push(
    `### Do`,
    `- Make the failing check pass with the smallest change consistent with the task.`,
    `- Keep the task's Open ID / capability scope; no new product work.`,
  );
  return lines.join("\n");
}
