import {
  FakeCodingAgent,
  isFakeCompletionPayload,
  runFakeValidation,
  type CodingAgent,
  type FakeCompletionPayload,
} from "@coppergate/agents";
import {
  appendRunEvent,
  appendUsageEvent,
  applyTaskTransition,
  assertSufficientBudget,
  buildDeliveryReport,
  buildDiffSummary,
  createArtifact,
  getTaskById,
  isRunCancelRequested,
  markRunAwaitingReview,
  markRunFailed,
  markRunValidating,
  parseJsonArray,
  persistDeliveryArtifacts,
  renewRunLease,
  setTaskPrUrl,
  type AgentRun,
  type Database,
  type Task,
} from "@coppergate/db";
import type { GithubDeliveryClient } from "@coppergate/github";
import { trackFunnelEvent, type Logger } from "@coppergate/telemetry";
import { resolveGithubDelivery } from "./github-delivery.js";

/**
 * Execute a claimed run with CodingAgent.
 * VALIDATING → validation artifact → REVIEW_REQUIRED or FAILED.
 * Never DONE (FR-04 / FR-06).
 */
export async function executeClaimedRun(
  db: Database,
  input: {
    run: AgentRun;
    workerId: string;
    log: Logger;
    leaseMs: number;
    agent?: CodingAgent;
    /** Defaults to FakeGithubDelivery (never touches default branch). */
    github?: GithubDeliveryClient;
  },
): Promise<"review_required" | "failed" | "cancelled" | "validation_failed"> {
  const { run, workerId, log, leaseMs } = input;
  const agent = input.agent ?? new FakeCodingAgent();

  const task = await getTaskById(db, run.taskId);
  if (!task) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "task_missing",
      errorMessage: "Task not found for run",
    });
    return "failed";
  }

  // Honor paused budgets (TASK027) — fail closed before agent work.
  try {
    await assertSufficientBudget(
      db,
      run.workspaceId,
      run.projectId,
      0,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "budget_paused",
      errorMessage: message.slice(0, 500),
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log);
    return "failed";
  }

  if (task.status === "QUEUED") {
    try {
      await applyTaskTransition(db, {
        workspaceId: run.workspaceId,
        taskId: task.id,
        toStatus: "RUNNING",
        actor: `worker:${workerId}`,
        reason: "agent claimed",
      });
    } catch (err) {
      log.warn("task transition to RUNNING skipped", {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let completion: FakeCompletionPayload | null = null;
  let actualCost = 0;
  let sawCancel = false;

  try {
    for await (const event of agent.run({
      runId: run.id,
      taskId: task.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      goal: task.goal,
      scope: task.scope,
      allowedPaths: parseJsonArray(task.allowedPaths),
      acceptanceCriteria: parseJsonArray(task.acceptanceCriteria),
      baseSha: run.baseSha,
      toolAllowlist: parseJsonArray(run.toolAllowlist),
      spendCapMicros: run.spendCapMicros,
      isCancelRequested: () => isRunCancelRequested(db, run.id),
    })) {
      await renewRunLease(db, run.id, workerId, leaseMs);

      await appendRunEvent(db, {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: event.kind,
        payload: {
          message: event.message,
          ...(event.payload ?? {}),
        },
      });

      if (event.kind === "cost" && event.payload?.costMicros != null) {
        actualCost = Number(event.payload.costMicros) || actualCost;
      }

      if (event.kind === "error" && event.payload?.code === "cancelled") {
        sawCancel = true;
        break;
      }

      if (event.kind === "completion" && isFakeCompletionPayload(event.payload)) {
        completion = event.payload;
        actualCost = event.payload.actualCostMicros || actualCost;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendRunEvent(db, {
      runId: run.id,
      workspaceId: run.workspaceId,
      kind: "error",
      payload: { message },
    });
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "agent_error",
      errorMessage: message.slice(0, 500),
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log);
    return "failed";
  }

  if (sawCancel || !completion) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: sawCancel ? "cancelled" : "incomplete",
      errorMessage: sawCancel
        ? "Run cancelled"
        : "Agent finished without completion payload",
    });
    await safeTaskTransition(
      db,
      task,
      sawCancel ? "CANCELLED" : "FAILED",
      workerId,
      log,
    );
    return sawCancel ? "cancelled" : "failed";
  }

  await applyTaskTransition(db, {
    workspaceId: run.workspaceId,
    taskId: task.id,
    toStatus: "VALIDATING",
    actor: `worker:${workerId}`,
    reason: "fake agent completed",
  }).catch((err: unknown) => {
    log.warn("task VALIDATING transition skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  await markRunValidating(db, { runId: run.id, workerId });
  await renewRunLease(db, run.id, workerId, leaseMs);

  const report = runFakeValidation({
    goal: task.goal,
    acceptanceCriteria: parseJsonArray(task.acceptanceCriteria),
    completion,
  });

  await createArtifact(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    kind: "validation_report",
    body: report,
    meta: {
      passed: report.passed,
      summary: report.summary,
      checks: report.checks,
      validator: report.validator,
    },
  });

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: report.summary,
      validation: report.passed ? "passed" : "failed",
      validator: report.validator,
    },
  });

  if (!report.passed) {
    await markRunFailed(db, {
      runId: run.id,
      workerId,
      errorCode: "validation_failed",
      errorMessage: report.summary.slice(0, 500),
    });
    await safeTaskTransition(db, task, "FAILED", workerId, log, "VALIDATING");
    log.info("validation failed — auto-completion blocked", {
      runId: run.id,
      taskId: task.id,
    });
    return "validation_failed";
  }

  // Deliver PR via GitHub port — fake by default; `GITHUB_DELIVERY_MODE=http` for staging.
  let github: GithubDeliveryClient;
  let repo = { owner: "example", repo: "repo", defaultBranch: "main" };
  let baseSha = run.baseSha;
  if (input.github) {
    github = input.github;
  } else {
    const resolved = await resolveGithubDelivery(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      baseSha: run.baseSha,
    });
    github = resolved.client;
    repo = resolved.repo;
    baseSha = resolved.baseSha;
    log.info("github delivery resolved", {
      mode: resolved.mode,
      repo: `${repo.owner}/${repo.repo}`,
    });
  }

  const delivery = await github.deliverPullRequest({
    repo,
    branchName: completion.branchName,
    baseSha,
    commitMessage: `Coppergate: ${task.title}`,
    prTitle: `Coppergate: ${task.title}`,
    prBody: `Task \`${task.id}\` · run \`${run.id}\` · repo \`${repo.owner}/${repo.repo}\``,
    files: (completion.filesChanged.length
      ? completion.filesChanged
      : ["README.md"]
    ).map((path) => ({
      path,
      content: `// coppergate run ${run.id}\n`,
    })),
    idempotencyKey: `task:${task.id}:run:${run.id}`,
  });

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: "Pull request delivered",
      prUrl: delivery.prUrl,
      prNumber: delivery.prNumber,
      headSha: delivery.headSha,
      branchName: delivery.branchName,
      created: delivery.created,
    },
  });

  trackFunnelEvent(log, {
    stage: "pr_opened",
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    meta: {
      prNumber: delivery.prNumber,
      created: delivery.created,
    },
  });

  const filesChanged = completion.filesChanged.length
    ? completion.filesChanged
    : ["README.md"];
  await persistDeliveryArtifacts(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: task.id,
    runId: run.id,
    diff: buildDiffSummary({
      branchName: delivery.branchName,
      headSha: delivery.headSha,
      baseSha: run.baseSha,
      filesChanged,
      notes: ["Sanitized file list for human review"],
    }),
    report: buildDeliveryReport({
      taskId: task.id,
      runId: run.id,
      prUrl: delivery.prUrl,
      prNumber: delivery.prNumber,
      branchName: delivery.branchName,
      headSha: delivery.headSha,
      actualCostMicros: actualCost,
      validationPassed: true,
      filesChanged,
    }),
  });

  await applyTaskTransition(db, {
    workspaceId: run.workspaceId,
    taskId: task.id,
    toStatus: "REVIEW_REQUIRED",
    actor: `worker:${workerId}`,
    reason: "fake validation passed — human review required",
  }).catch((err: unknown) => {
    log.warn("task REVIEW_REQUIRED transition skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  await markRunAwaitingReview(db, {
    runId: run.id,
    workerId,
    branchName: delivery.branchName,
    headSha: delivery.headSha,
    prNumber: delivery.prNumber,
    prUrl: delivery.prUrl,
    actualCostMicros: actualCost,
  });

  if (actualCost > 0) {
    await appendUsageEvent(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      taskId: task.id,
      runId: run.id,
      kind: "llm_tokens",
      costMicros: actualCost,
      quantity: String(completion.estimatedTokens),
      provider: "fake",
      model: "fake-coding-agent-v1",
    });
  }

  await setTaskPrUrl(db, task.id, delivery.prUrl);

  log.info("run awaiting review (not DONE)", {
    runId: run.id,
    taskId: task.id,
    prUrl: delivery.prUrl,
  });

  return "review_required";
}

async function safeTaskTransition(
  db: Database,
  task: Task,
  toStatus: "FAILED" | "CANCELLED",
  workerId: string,
  log: Logger,
  fromHint?: "RUNNING" | "VALIDATING",
): Promise<void> {
  try {
    const current = await getTaskById(db, task.id);
    if (!current || current.status === toStatus) return;

    if (current.status === "QUEUED") {
      await applyTaskTransition(db, {
        workspaceId: current.workspaceId,
        taskId: current.id,
        toStatus: "RUNNING",
        actor: `worker:${workerId}`,
        reason: "prepare terminal",
      });
    }

    const refreshed = await getTaskById(db, task.id);
    if (!refreshed) return;

    if (refreshed.status === "VALIDATING" || fromHint === "VALIDATING") {
      if (refreshed.status === "VALIDATING") {
        await applyTaskTransition(db, {
          workspaceId: refreshed.workspaceId,
          taskId: refreshed.id,
          toStatus,
          actor: `worker:${workerId}`,
          reason: toStatus.toLowerCase(),
        });
        return;
      }
    }

    if (refreshed.status === "RUNNING") {
      await applyTaskTransition(db, {
        workspaceId: refreshed.workspaceId,
        taskId: refreshed.id,
        toStatus,
        actor: `worker:${workerId}`,
        reason: toStatus.toLowerCase(),
      });
    }
  } catch (err) {
    log.warn("task failure transition skipped", {
      taskId: task.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
